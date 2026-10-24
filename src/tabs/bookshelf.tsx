import { readCustomMediumHosts } from '../shared/custom-medium-hosts'
import { readBookshelfLibrary, exportBookshelfFiles, type BookshelfLibrary } from '../shared/bookshelf-library'
import { isPro } from '../shared/pro'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BookshelfEntry, BookshelfHighlight } from '../shared/bookshelf-model'
import { bookshelfRequest, bookshelfProUrl } from '../shared/bookshelf-client'
import { createSearchIndex, searchBookshelf } from '../shared/bookshelf-search'
import { buildParagraphLink, mediumPostId } from '../shared/medium-url'
import { encodeZip } from '../shared/zip'
import { triggerDownload } from '../shared/markdown-download'
import { sendClipToObsidian, OBSIDIAN_SENT_MESSAGE } from '../shared/obsidian-clip'
import { sendToTab } from '../shared/injection'
import './bookshelf.css'
import { applyPageTheme } from '../shared/theme'

applyPageTheme()

type Library = BookshelfLibrary
function Note({ highlight, onSave }: { highlight: BookshelfHighlight; onSave: (id: number, note: string) => Promise<void> }) {
  const [note, setNote] = useState(highlight.note || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => setNote(highlight.note || ''), [highlight.note])
  return <form className="shelf-note" onSubmit={async e => {
    e.preventDefault(); setSaving(true)
    try { await onSave(highlight.id!, note) } finally { setSaving(false) }
  }}>
    <label>Private note<textarea aria-label="Private note" value={note} disabled={saving} onChange={e => setNote(e.target.value)} rows={2} /></label>
    <button disabled={saving || note === (highlight.note || '')}>{saving ? 'Saving…' : 'Save note'}</button>
  </form>
}
// A closed <details> still puts its children in the DOM; with hundreds of
// archives that is megabytes of text nobody opened. Render on first open.
function Archive({ item }: { item: BookshelfEntry }) {
  const [open, setOpen] = useState(false)
  return <details onToggle={e => { if ((e.currentTarget as HTMLDetailsElement).open) setOpen(true) }}>
    <summary>Archived article · {item.wordCount} words · {new Date(item.capturedAt!).toLocaleDateString()}</summary>
    {open && <pre className="shelf-archive">{item.markdown}</pre>}
  </details>
}
export default function Bookshelf() {
  const [library, setLibrary] = useState<Library>({ items: [], highlights: [], pro: false, enabled: true })
  const [loaded, setLoaded] = useState(false)
  const [filter, setFilter] = useState('unread')
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [limit, setLimit] = useState(50)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleted, setDeleted] = useState<{ token: string; title: string }>()
  const [obsidianEnabled, setObsidianEnabled] = useState(false)
  const [customHosts, setCustomHosts] = useState<string[]>([])
  const [storyTabs, setStoryTabs] = useState<Record<string, number>>({})
  const refresh = useCallback(async () => {
    const result = await readBookshelfLibrary()
    setLibrary(result)
    setLoaded(true)
    const settings = await chrome.storage.local.get({ obsidianClipperEnabled: false })
    setObsidianEnabled(settings.obsidianClipperEnabled)
    // Enumerate open tabs locally; Archive now never opens or fetches a story.
    const tabs = await chrome.tabs.query({})
    const hosts = await readCustomMediumHosts()
    setCustomHosts(hosts)
    const stories: Record<string, number> = {}
    for (const tab of tabs) {
      const key = mediumPostId(tab.url || '', hosts)
      if (key && tab.id !== undefined) stories[key] = tab.id
    }
    setStoryTabs(stories)
  }, [])
  useEffect(() => {
    document.title = 'Bookshelf · Medium Enhancer'
    const update = () => { refresh().catch(error => setError(error.message)) }
    update()
    // Library data is in IndexedDB; storage only carries the settings this page shows.
    const relevant = new Set(['customMediumHosts', 'bookshelfEnabled', 'obsidianClipperEnabled', 'enhancerProUnlocked', 'enhancerProKey'])
    const onStorage = (changes: Record<string, chrome.storage.StorageChange>) => { if (Object.keys(changes).some(key => relevant.has(key))) update() }
    chrome.storage.onChanged.addListener(onStorage)
    window.addEventListener('focus', update)
    return () => { chrome.storage.onChanged.removeListener(onStorage); window.removeEventListener('focus', update) }
  }, [refresh])
  useEffect(() => {
    // Expiry changes without a storage event; also recheck when a hidden tab returns.
    let disposed = false
    const check = async () => {
      try {
        const pro = await isPro()
        if (!disposed && pro !== library.pro) { setQuery(''); setDebounced(''); await refresh() }
      } catch (error) { if (!disposed) setError((error as Error).message) }
    }
    const timer = setInterval(() => { void check() }, 60000)
    const visible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', visible)
    return () => { disposed = true; clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [library.pro, refresh])
  useEffect(() => {
    const timer = setTimeout(() => { setDebounced(query); setLimit(50) }, 180)
    return () => clearTimeout(timer)
  }, [query])
  useEffect(() => {
    if (!deleted) return
    const timer = setTimeout(() => setDeleted(undefined), 10000)
    return () => clearTimeout(timer)
  }, [deleted])
  const index = useMemo(() => createSearchIndex(library.items, library.highlights), [library.items, library.highlights])
  const results = useMemo(() => {
    const all = debounced.trim() && library.pro ? searchBookshelf(index, debounced, library.pro) : library.items.map(item => ({ item, snippet: '' }))
    return all.filter(({ item }) => filter === 'all' || (filter === 'read' ? item.readAt !== null : item.readAt === null))
  }, [library, index, debounced, filter])
  const grouped = useMemo(() => {
    const map = new Map<string, BookshelfHighlight[]>()
    for (const h of library.highlights) { const list = map.get(h.itemKey); if (list) list.push(h); else map.set(h.itemKey, [h]) }
    return map
  }, [library.highlights])
  const perform = async (action: () => Promise<void>) => {
    setError(''); setFeedback(''); setBusy(true)
    try { await action(); await refresh() }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  const exportAll = () => perform(async () => {
    const files = await exportBookshelfFiles()
    const bytes = encodeZip(files.map((file: { name: string; content: string }) => ({ name: file.name, data: new TextEncoder().encode(file.content) })))
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }))
    try { await triggerDownload(`Bookshelf-${new Date().toISOString().slice(0, 10)}.zip`, url); setFeedback('ZIP backup saved to Downloads.') }
    finally { URL.revokeObjectURL(url) }
  })
  const proLabel = !library.pro && <a className="shelf-pro" href={bookshelfProUrl()} target="_blank" rel="noopener">Pro</a>
  return <main className="shelf">
    <header className="shelf-header"><div><p className="shelf-eyebrow">MEDIUM ENHANCER</p><h1>Bookshelf</h1>
      <p>Your library lives in your browser and your files; there is no server to shut down.</p></div>
      <a href={chrome.runtime.getURL('options.html')} target="_blank" rel="noopener">Options</a></header>
    <div className="shelf-toolbar">
      <div className="shelf-filters" role="group" aria-label="Reading status">{['unread', 'read', 'all'].map(value => <button key={value} aria-pressed={filter === value}
        onClick={() => { setFilter(value); setLimit(50) }}>{value[0].toUpperCase() + value.slice(1)}</button>)}</div>
      <label className="shelf-search">Search{proLabel}<input type="search" aria-label="Search Bookshelf" placeholder="Title, author, archive, highlights, notes"
        disabled={!library.pro} value={query} onChange={e => setQuery(e.target.value)} /></label>
      <div><button disabled={!library.pro || busy || !library.items.length} onClick={exportAll}>Export all (.zip)</button> {proLabel}</div>
    </div>
    {!library.enabled && <p>Bookshelf capture is off. Enable it in Options to save more stories.</p>}
    {error && <p className="shelf-error" role="alert">{error}</p>}
    {feedback && <p role="status">{feedback}</p>}
    {deleted && <div className="shelf-toast" role="status">Deleted “{deleted.title}”. <button disabled={busy} onClick={() => perform(async () => {
      await bookshelfRequest({ action: 'undo', token: deleted.token }); setDeleted(undefined)
    })}>Undo</button></div>}
    <p className="shelf-count" role="status">{loaded ? `${results.length} ${results.length === 1 ? 'story' : 'stories'}` : 'Loading Bookshelf…'}</p>
    {loaded && !results.length && <p>{library.items.length ? 'No stories match this filter.' : 'Save a Medium story from the popup or right-click menu to start your library.'}</p>}
    <div className="shelf-list">{results.slice(0, limit).map(({ item, snippet }) => {
      const entry = item as BookshelfEntry
      return <article className="shelf-item" key={item.key} data-item-key={item.key}>
        <h2><a href={item.url} target="_blank" rel="noopener">{item.title}</a></h2>
        <p className="shelf-byline">{[item.author, item.publication].filter(Boolean).join(' · ')} · Saved {new Date(item.savedAt).toLocaleDateString()}</p>
        {item.subtitle && <p>{item.subtitle}</p>}
        {snippet && <p className="shelf-snippet">{snippet}</p>}
        <div className="shelf-actions">
          <a href={item.url} target="_blank" rel="noopener">Open story</a>
          <button disabled={busy} onClick={() => perform(async () => { await bookshelfRequest({ action: 'read', key: item.key, read: item.readAt === null }) })}>
            Mark {item.readAt === null ? 'read' : 'unread'}</button>
          <button disabled={busy} onClick={() => perform(async () => {
            const result = await bookshelfRequest({ action: 'delete', key: item.key }); setDeleted({ token: result.token, title: item.title })
          })}>Delete</button>
          <span><button disabled={!library.pro || busy || !library.enabled || storyTabs[item.key] === undefined} title="Requires this story to be open in another tab"
            onClick={() => perform(async () => {
              // The content script and background verify the current tab URL again.
              const response = await sendToTab(storyTabs[item.key], { type: 'saveToBookshelf', archiveOnly: true, expectedKey: item.key })
              if (!response?.ok) throw new Error(response?.error || 'Open this story in another tab to archive it.')
              setFeedback('Article archived from your open story tab.')
            })}>Archive now</button> {proLabel}</span>
          {obsidianEnabled && <span><button disabled={!library.pro || busy} onClick={() => perform(async () => {
            const { clip } = await bookshelfRequest({ action: 'obsidian', key: item.key })
            const response = await sendClipToObsidian(clip)
            if (response.ok === false) throw new Error(response.error)
            setFeedback(OBSIDIAN_SENT_MESSAGE)
          })}>Export to Obsidian</button> {proLabel}</span>}
        </div>
        {entry.hasArchive && (library.pro ? <Archive item={item} /> : <p className="shelf-locked">Archived article {proLabel}</p>)}
        {(entry.highlightCount > 0 || !library.pro) && <div className={!library.pro ? 'shelf-locked' : ''}>
          <h3>Private highlights &amp; notes {proLabel}</h3>
          {library.pro && (grouped.get(item.key) || []).map(h => <section className="shelf-highlight" key={h.id}>
            <blockquote>{h.text}</blockquote><a href={buildParagraphLink(item.url, h.paragraphId, customHosts)} target="_blank" rel="noopener">Open paragraph</a>
            <Note highlight={h} onSave={(id, note) => perform(async () => { await bookshelfRequest({ action: 'note', id, note }) })} />
          </section>)}
        </div>}
      </article>
    })}</div>
    {results.length > limit && <button onClick={() => setLimit(value => value + 50)}>Show more stories</button>}
    <footer>Stored only in this browser. Export a ZIP backup to keep your files. Uninstalling the extension deletes your Bookshelf.</footer>
  </main>
}
