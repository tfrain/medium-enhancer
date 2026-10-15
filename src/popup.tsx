import "./popup.css"
import { useState, useEffect } from "react"
import { triggerMarkdownDownload } from "./shared/markdown-download"
import { triggerJsonDownload } from "./shared/json-download"
import {
  EMPTY_MEDIUM_EARNINGS,
  MEDIUM_EARNINGS_STORAGE_KEY,
  mediumEarningsExport,
  normalizeMediumEarningsSnapshot,
  type MediumEarningsSnapshot,
} from "./shared/medium-earnings"

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
type EarningsStatus = "idle" | "working" | "done" | "error"

const isMediumUrl = (url: string | undefined) => {
  if (!url) return false
  try {
    const hostname = new URL(url).hostname.toLowerCase()
    return hostname === "medium.com" || hostname.endsWith(".medium.com")
  } catch {
    return false
  }
}

function IndexPopup() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  // null = loading, true = Medium article, false = not Medium
  const [isMediumPage, setIsMediumPage] = useState<boolean | null>(null)
  const [clipStatus, setClipStatus] = useState<ClipStatus>("idle")
  const [clipError, setClipError] = useState<string>("")
  const [mediumTabId, setMediumTabId] = useState<number | null>(null)
  const [earningsSnapshot, setEarningsSnapshot] = useState<MediumEarningsSnapshot | null>(EMPTY_MEDIUM_EARNINGS)
  const [earningsStatus, setEarningsStatus] = useState<EarningsStatus>("idle")
  const [earningsError, setEarningsError] = useState("")

  const refreshEarningsSnapshot = () => {
    chrome.storage.local.get({ [MEDIUM_EARNINGS_STORAGE_KEY]: EMPTY_MEDIUM_EARNINGS }, (items) => {
      setEarningsSnapshot(normalizeMediumEarningsSnapshot(items[MEDIUM_EARNINGS_STORAGE_KEY]))
    })
  }

  const handleSyncEarnings = () => {
    if (mediumTabId === null) return
    setEarningsStatus("working")
    setEarningsError("")
    chrome.runtime.sendMessage({ type: "sync-medium-earnings", tabId: mediumTabId }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setEarningsStatus("error")
        setEarningsError(response?.error || chrome.runtime.lastError?.message || "Could not sync earnings.")
        return
      }
      setEarningsSnapshot(normalizeMediumEarningsSnapshot(response.snapshot))
      setEarningsStatus("done")
    })
  }

  const handleExportEarnings = async () => {
    if (!earningsSnapshot) return
    setEarningsStatus("working")
    setEarningsError("")
    try {
      await triggerJsonDownload("medium-earnings-snapshot.json", mediumEarningsExport(earningsSnapshot))
      setEarningsStatus("done")
    } catch (error: any) {
      setEarningsStatus("error")
      setEarningsError(error?.message || "Could not export earnings.")
    }
  }

  // Explicit-click only — this never runs on its own. Works on any site.
  const handleClipToMarkdown = () => {
    setClipStatus("working")
    setClipError("")
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab?.id) {
        setClipStatus("error")
        setClipError("No active tab found.")
        return
      }
      chrome.tabs.sendMessage(tab.id, { type: "clipPageAsMarkdown" }, async (response) => {
        if (chrome.runtime.lastError || !response?.ok) {
          setClipStatus("error")
          setClipError(response?.error || chrome.runtime.lastError?.message || "Could not read this page.")
          return
        }
        // mode 'obsidian': the content script already sent it to the
        // configured vault folder. mode 'download': fall back to a file save.
        try {
          if (response.mode === "download") {
            await triggerMarkdownDownload(response.title, response.markdown)
          }
          setClipStatus("done")
          setTimeout(() => setClipStatus("idle"), 1500)
        } catch (e: any) {
          setClipStatus("error")
          setClipError(e?.message || "Download failed.")
        }
      })
    })
  }

  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    let activeTabId: number | undefined

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url) { setIsMediumPage(false); return }
      activeTabId = tab.id
      if (isMediumUrl(tab.url) && tab.id !== undefined) setMediumTabId(tab.id)
      if (/-[0-9a-z]{10,}(?:[/?#]|$)/i.test(tab.url)) {
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
      }
    })

    const storageListener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (activeTabId === undefined) return
      const feedsKey = `feeds_${activeTabId}`
      if (changes[feedsKey]) {
        const newFeeds = changes[feedsKey].newValue || []
        setFeeds(newFeeds)
        clearTimeout(fallbackTimer)
        setIsMediumPage(true)
      }
      if (changes[MEDIUM_EARNINGS_STORAGE_KEY]) {
        setEarningsSnapshot(normalizeMediumEarningsSnapshot(changes[MEDIUM_EARNINGS_STORAGE_KEY].newValue))
      }
    }

    refreshEarningsSnapshot()

    chrome.storage.onChanged.addListener(storageListener)
    return () => {
      chrome.storage.onChanged.removeListener(storageListener)
      clearTimeout(fallbackTimer)
    }
  }, [])

  const renderBody = () => {
    if (isMediumPage === null) {
      return <p className="popup-message">Loading…</p>
    }
    if (!isMediumPage) {
      return <p className="popup-message">Open a Medium article to discover RSS feeds.</p>
    }
    if (feeds.length === 0) {
      return <p className="popup-message">No RSS feeds found for this article.</p>
    }
    return feeds.map((feed, i) => <FeedCard key={i} feed={feed} />)
  }

  return (
    <div className="popup-root">
      <div className="popup-header">RSS Feeds</div>

      <button
        type="button"
        className="clip-markdown-btn"
        onClick={handleClipToMarkdown}
        disabled={clipStatus === "working"}
      >
        {clipStatus === "working"
          ? "Converting…"
          : clipStatus === "done"
            ? "Saved ✓"
            : "Convert Page to Markdown"}
      </button>
      {clipStatus === "error" && <p className="popup-message clip-error">{clipError}</p>}

      {mediumTabId !== null && (
        <section className="earnings-sync">
          <div className="earnings-sync-heading">Private Medium earnings</div>
          <p className="earnings-sync-copy">
            Syncs the current month, per-story earnings, and payout history locally. Session data is never saved or exported.
          </p>
          <div className="earnings-sync-actions">
            <button type="button" className="feed-btn" onClick={handleSyncEarnings} disabled={earningsStatus === "working"}>
              {earningsStatus === "working" ? "Syncing…" : "Sync earnings"}
            </button>
            <button type="button" className="feed-btn" onClick={handleExportEarnings} disabled={!earningsSnapshot || earningsStatus === "working"}>
              Export snapshot
            </button>
          </div>
          {earningsSnapshot && (
            <p className="earnings-sync-status">
              @{earningsSnapshot.username}: {earningsSnapshot.posts.length} stories, {earningsSnapshot.payouts.length} payouts, synced {new Date(earningsSnapshot.syncedAt).toLocaleString()}.
            </p>
          )}
          {earningsSnapshot?.issues.length ? <p className="popup-message clip-error">{earningsSnapshot.issues.join(" ")}</p> : null}
          {earningsStatus === "error" && <p className="popup-message clip-error">{earningsError}</p>}
        </section>
      )}

      {renderBody()}
      <footer className="popup-footer">
        Follow me on Medium:&nbsp;
        <a href="https://wesley-wei.medium.com/" target="_blank" rel="noopener noreferrer">
          @WesleyWei
        </a>
        <br />
        Feedback:&nbsp;
        <a href="https://t.me/tfrain_w" target="_blank" rel="noopener noreferrer">
          Telegram
        </a>
      </footer>
    </div>
  )
}

export default IndexPopup
