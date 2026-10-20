import { useEffect, useState } from 'react'
import { bookshelfRequest, bookshelfUrl, bookshelfProUrl } from '../shared/bookshelf-client'
import { mediumPostId } from '../shared/medium-url'
import { sendToTab } from '../shared/injection'

export function BookshelfPopup() {
  const [tabId, setTabId] = useState<number>()
  const [key, setKey] = useState<string>()
  const [status, setStatus] = useState({ enabled: true, pro: false, saved: false, archived: false })
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  useEffect(() => {
    let disposed = false
    const refresh = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
        const postId = mediumPostId(tab?.url || '')
        const result = await bookshelfRequest({ action: 'status', key: postId || undefined })
        if (!disposed) { setTabId(tab?.id); setKey(postId || undefined); setStatus(result) }
      } catch (error) { if (!disposed) setFeedback((error as Error).message) }
    }
    void refresh()
    const changed = () => { void refresh() }
    chrome.storage.onChanged.addListener(changed)
    return () => { disposed = true; chrome.storage.onChanged.removeListener(changed) }
  }, [])
  const save = async (archiveOnly = false) => {
    if (tabId === undefined) return
    setBusy(true)
    setFeedback('')
    try {
      const response = await sendToTab(tabId, { type: 'saveToBookshelf', archiveOnly, expectedKey: key })
      if (!response?.ok) throw new Error(response?.error || 'Could not save this story.')
      setFeedback(response.warning ? `Saved. Archive unavailable: ${response.warning}` : response.archived ? 'Saved and archived to Bookshelf' : 'Saved to Bookshelf')
      setStatus(await bookshelfRequest({ action: 'status', key }))
    } catch (error) { setFeedback((error as Error).message) }
    finally { setBusy(false) }
  }
  return <section className="bookshelf-popup" aria-label="Bookshelf">
    <a href={bookshelfUrl()} target="_blank" rel="noopener">Open Bookshelf</a>
    {key && status.enabled && <div className="clip-actions">
      <button type="button" className="clip-markdown-btn" disabled={busy} onClick={() => save()}>{busy ? 'Saving…' : 'Save to Bookshelf'}</button>
      {status.saved && <button type="button" className="clip-markdown-btn" disabled={busy || !status.pro} onClick={() => save(true)}>
        Archive now{!status.pro && ' · Pro'}
      </button>}
      {status.saved && !status.pro && <a href={bookshelfProUrl()} target="_blank" rel="noopener">Pro</a>}
    </div>}
    {feedback && <p className="popup-message" role="status">{feedback}</p>}
  </section>
}
