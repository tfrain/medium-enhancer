import "./popup.css"
import { useState, useEffect } from "react"

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

function IndexPopup() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  // null = loading, true = Medium article, false = not Medium
  const [isMediumPage, setIsMediumPage] = useState<boolean | null>(null)

  useEffect(() => {
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined
    let activeTabUrl: string | undefined  // capture active tab URL for storage listener guard

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (!tab || !tab.url) { setIsMediumPage(false); return }
      activeTabUrl = tab.url
      if (/-[0-9a-z]{10,}$/.test(tab.url)) {
        chrome.storage.local.get(['feeds'], (result) => {
          if (result.feeds && result.feeds.length > 0) {
            setFeeds(result.feeds)
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
      if (changes.feeds) {
        // Only update if the storage write is still relevant to the tab this popup opened for
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.url === activeTabUrl) {
            const newFeeds = changes.feeds.newValue || []
            setFeeds(newFeeds)
            clearTimeout(fallbackTimer)
            setIsMediumPage(true)
          }
        })
      }
    }

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
