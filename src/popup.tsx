import { BookshelfPopup } from './components/bookshelf-popup'
import { OBSIDIAN_SENT_MESSAGE } from "./shared/obsidian-clip"
import { ARTICLE_URL } from "./shared/whats-new"
import { inspectMediumPage } from "./shared/medium-page"
import { classifyMediumUrl } from "./shared/medium-url"
import "./popup.css"
import { useState, useEffect } from "react"
import { triggerMarkdownDownload } from "./shared/markdown-download"
import { sendToTab } from "./shared/injection"

interface Feed {
  name: string
  url: string
  type?: 'user' | 'publication'  // optional for backward compat with stored feeds from prior version
}

const USER_ICON = "👤"
const PUB_ICON = "📰"

function FeedCard({ feed }: { feed: Feed }) {
  const [copied, setCopied] = useState(false)
  const fullUrl = `https://${feed.url}`
  const type = feed.type ?? 'user'
  const icon = type === 'publication' ? PUB_ICON : USER_ICON
  const label = type === 'publication' ? 'Publication Feed' : 'User Feed'
  const inoreaderUrl = `https://www.inoreader.com/search/feeds/${encodeURIComponent(fullUrl)}`

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="feed-card">
      <div className="feed-card-type">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="feed-card-url" title={fullUrl}>
        {feed.url}
      </div>
      <div className="feed-card-actions">
        <button
          className={`feed-btn${copied ? ' copied' : ''}`}
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <a
          className="feed-btn"
          href={inoreaderUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Inoreader
        </a>
      </div>
    </div>
  )
}

type ClipStatus = "idle" | "working" | "done" | "error"

function IndexPopup() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  // null = loading, true = Medium article, false = not Medium
  const [isMediumPage, setIsMediumPage] = useState<boolean | null>(null)
  const [clipStatus, setClipStatus] = useState<ClipStatus>("idle")
  const [obsidianEnabled, setObsidianEnabled] = useState(false)
  const [clipTarget, setClipTarget] = useState<'download' | 'obsidian'>('download')
  const [clipError, setClipError] = useState<string>("")

  // Explicit-click only — this never runs on its own. Works on any site.
  const handleClipToMarkdown = (target: 'download' | 'obsidian') => {
    setClipTarget(target)
    setClipStatus("working")
    setClipError("")
    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab?.id) {
        setClipStatus("error")
        setClipError("No active tab found.")
        return
      }
      try {
        // Opening the popup granted activeTab, so this works on any normal page.
        const response: any = await sendToTab(tab.id, { type: "clipPageAsMarkdown", target })
        if (!response?.ok) throw new Error(response?.error || "Could not read this page.")
        if (response.mode === "download") {
          await triggerMarkdownDownload(response.title, response.markdown)
        }
        if (target === 'obsidian') {
          await chrome.tabs.sendMessage(tab.id, { type: 'showExportToast', text: OBSIDIAN_SENT_MESSAGE })
            .catch(error => console.warn('Cannot show Obsidian feedback on this page', error))
        }
        setClipStatus("done")
        setTimeout(() => setClipStatus("idle"), 1500)
      } catch (e: any) {
        setClipStatus("error")
        setClipError(/Cannot access|cannot be scripted/i.test(e?.message || "")
          ? "Chrome does not allow extensions on this page."
          : e?.message || "Could not read this page.")
      }
    })
  }

  useEffect(() => {
    chrome.storage.local.get({ obsidianClipperEnabled: false }, items => setObsidianEnabled(items.obsidianClipperEnabled))
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    let activeTabId: number | undefined
    let activeTabIsMedium = false
    let disposed = false

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url) { setIsMediumPage(false); return }
      activeTabId = tab.id
      activeTabIsMedium = !!classifyMediumUrl(tab.url)
      if (activeTabIsMedium) {
        const feedsKey = `feeds_${tab.id}`
        chrome.storage.local.get([feedsKey], (result) => {
          const stored = result[feedsKey]
          if (stored && stored.length > 0) {
            setFeeds(stored)
            setIsMediumPage(true)
          } else {
            fallbackTimer = setTimeout(() => setIsMediumPage(true), 2500)
          }
        })
      } else {
        setIsMediumPage(false)
        setFeeds([])
        if (tab.id === undefined) return
        chrome.scripting.executeScript({ target: { tabId: tab.id }, func: inspectMediumPage })
          .then(results => {
            if (disposed) return
            const page = results[0]?.result
            activeTabIsMedium = !!page?.isMediumStory
            setIsMediumPage(activeTabIsMedium)
            if (activeTabIsMedium) setFeeds(page.feeds.map(url => ({ name: 'RSS Feed', url: url.replace(/^https?:\/\//i, ''), type: 'publication' })))
          })
          .catch(() => { if (!disposed) setIsMediumPage(false) })
      }
    })

    const storageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return
      if (changes.obsidianClipperEnabled) setObsidianEnabled(!!changes.obsidianClipperEnabled.newValue)
      if (activeTabId === undefined) return
      const feedsKey = `feeds_${activeTabId}`
      if (activeTabIsMedium && changes[feedsKey]) {
        const newFeeds = changes[feedsKey].newValue || []
        setFeeds(newFeeds)
        clearTimeout(fallbackTimer)
        setIsMediumPage(true)
      }
    }

    chrome.storage.onChanged.addListener(storageListener)
    return () => {
      disposed = true
      chrome.storage.onChanged.removeListener(storageListener)
      clearTimeout(fallbackTimer)
    }
  }, [])

  const renderBody = () => {
    if (isMediumPage === null) {
      return <p className="popup-message">Loading…</p>
    }
    if (!isMediumPage) {
      return <p className="popup-message">Open a Medium article, profile or publication to discover RSS feeds.</p>
    }
    if (feeds.length === 0) {
      return <p className="popup-message">No RSS feeds found for this page.</p>
    }
    return feeds.map((feed, i) => <FeedCard key={i} feed={feed} />)
  }

  return (
    <div className="popup-root">
      <div className="popup-header">RSS Feeds</div>
      <BookshelfPopup />

      <div className="clip-actions">
        <button type="button" className="clip-markdown-btn"
          onClick={() => handleClipToMarkdown('download')} disabled={clipStatus === 'working'}>
          {clipStatus === 'working' && clipTarget === 'download' ? 'Downloading...' : 'Download .md'}
        </button>
        {obsidianEnabled && <button type="button" className="clip-markdown-btn"
          onClick={() => handleClipToMarkdown('obsidian')} disabled={clipStatus === 'working'}>
          {clipStatus === 'working' && clipTarget === 'obsidian' ? 'Opening...' : 'Send to Obsidian'}
        </button>}
      </div>
      {clipStatus === 'done' && <p className="popup-message">{clipTarget === 'obsidian' ? 'Opened Obsidian' : 'Saved to your Downloads folder'}</p>}
      {clipStatus === "error" && <p className="popup-message clip-error">{clipError}</p>}

      {renderBody()}
      <footer className="popup-footer">
        Follow me on Medium:&nbsp;
        <a href="https://wesley-wei.medium.com/" target="_blank" rel="noopener noreferrer">
          @WesleyWei
        </a>
        <br />
        Feedback:&nbsp;
        <a href={ARTICLE_URL} target="_blank" rel="noopener noreferrer">
          comment on this article
        </a>
      </footer>
    </div>
  )
}

export default IndexPopup
