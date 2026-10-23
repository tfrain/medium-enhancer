import { readCustomMediumHosts } from './shared/custom-medium-hosts'
import { BookshelfPopup } from './components/bookshelf-popup'
import { OBSIDIAN_SENT_MESSAGE } from "./shared/obsidian-clip"
import { ARTICLE_URL } from "./shared/whats-new"
import { inspectMediumPage } from "./shared/medium-page"
import { classifyMediumUrl, isMediumHost, isKnownMediumPublicationHost } from "./shared/medium-url"
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
  const [enableTarget, setEnableTarget] = useState<{ host: string; tabId: number } | null>(null)
  const [enableStatus, setEnableStatus] = useState('')
  const [enabling, setEnabling] = useState(false)
  const handleEnable = async () => {
    if (!enableTarget) return
    // Keep request in the click's user gesture, before any await.
    const permission = chrome.permissions.request({ origins: [`https://${enableTarget.host}/*`] })
    setEnabling(true)
    setEnableStatus('')
    try {
      if (!await permission) { setEnableStatus('Site permission was not granted.'); return }
      const result = await chrome.runtime.sendMessage({ type: 'enableCustomMediumHost', ...enableTarget })
      if (!result?.ok) throw new Error(result?.error || 'Could not enable this site.')
      setEnableTarget(null)
      setEnableStatus('Enabled on this site.')
    } catch (error) { setEnableStatus((error as Error).message) }
    finally { setEnabling(false) }
  }
  const [feeds, setFeeds] = useState<Feed[]>([])
  // null = loading, true = Medium article, false = not Medium
  const [isMediumPage, setIsMediumPage] = useState<boolean | null>(null)
  const [clipStatus, setClipStatus] = useState<ClipStatus>("idle")
  const [obsidianEnabled, setObsidianEnabled] = useState(false)
  const [clipTarget, setClipTarget] = useState<'download' | 'obsidian' | 'copy'>('download')
  const [clipError, setClipError] = useState<string>("")

  // Explicit-click only — this never runs on its own. Works on any site.
  const handleClipToMarkdown = (target: 'download' | 'obsidian' | 'copy') => {
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
        // Copy reads the Markdown like a download and writes it here: the popup has focus.
        const response: any = await sendToTab(tab.id, { type: "clipPageAsMarkdown", target: target === 'copy' ? 'download' : target })
        if (!response?.ok) throw new Error(response?.error || "Could not read this page.")
        if (target === 'copy') await navigator.clipboard.writeText(response.markdown)
        else if (response.mode === "download") {
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

    chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
      if (!tab || !tab.url) { setIsMediumPage(false); return }
      activeTabId = tab.id
      const customHosts = await readCustomMediumHosts()
      if (disposed) return
      activeTabIsMedium = !!classifyMediumUrl(tab.url, customHosts)
      if (activeTabIsMedium) {
        const feedsKey = `feeds_${tab.id}`
        // Written by the background when this tab's content script reports (storage.session).
        chrome.storage.session.get([feedsKey], (result) => {
          const stored = result[feedsKey]
          if (stored?.url === tab.url && stored.feeds?.length > 0) {
            setFeeds(stored.feeds)
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
            if (activeTabIsMedium) {
              const host = new URL(tab.url!).hostname
              if (new URL(tab.url!).protocol === 'https:' && !isMediumHost(host) && !isKnownMediumPublicationHost(host, customHosts)) {
                setEnableTarget({ host, tabId: tab.id! })
              }
              setFeeds(page.feeds.map(url => ({ name: 'RSS Feed', url: url.replace(/^https?:\/\//i, ''),
                type: /^https:\/\/medium\.com\/feed\/@[A-Za-z0-9_.-]+$/.test(url) ? 'user' : 'publication' })))
            }
          })
          .catch(() => { if (!disposed) setIsMediumPage(false) })
      }
    })

    const storageListener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === 'local' && changes.obsidianClipperEnabled) setObsidianEnabled(!!changes.obsidianClipperEnabled.newValue)
      if (area !== 'session' || activeTabId === undefined) return
      const feedsKey = `feeds_${activeTabId}`
      if (activeTabIsMedium && changes[feedsKey]) {
        const newFeeds = changes[feedsKey].newValue?.feeds || []
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
        <button type="button" className="clip-markdown-btn"
          onClick={() => handleClipToMarkdown('copy')} disabled={clipStatus === 'working'}>
          {clipStatus === 'working' && clipTarget === 'copy' ? 'Copying...' : 'Copy .md'}
        </button>
        {obsidianEnabled && <button type="button" className="clip-markdown-btn"
          onClick={() => handleClipToMarkdown('obsidian')} disabled={clipStatus === 'working'}>
          {clipStatus === 'working' && clipTarget === 'obsidian' ? 'Opening...' : 'Send to Obsidian'}
        </button>}
      </div>
      {clipStatus === 'done' && <p className="popup-message">{clipTarget === 'obsidian' ? 'Opened Obsidian' : clipTarget === 'copy' ? 'Markdown copied to the clipboard' : 'Saved to your Downloads folder'}</p>}
      {clipStatus === "error" && <p className="popup-message clip-error">{clipError}</p>}

      {enableTarget && <button type="button" className="clip-markdown-btn" disabled={enabling} onClick={handleEnable}>
        Enable Medium Enhancer on {enableTarget.host}
      </button>}
      {enableStatus && <p className="popup-message" role="status">{enableStatus}</p>}
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
