import { readCustomMediumHosts } from './custom-medium-hosts'
import { isPro } from './pro'
import { mediumPostId } from './medium-url'
import { normalizeItem, archiveItem, normalizeHighlight, requireBookshelfPro, type BookshelfMetadata } from './bookshelf-model'
import { getBookshelfItem, getBookshelfHighlights, deleteBookshelfHighlight, saveBookshelfItem, addBookshelfHighlight, updateBookshelfNote, deleteBookshelfItem, restoreBookshelfItem, type BookshelfDeleted } from './bookshelf-db'
import { exportMarkdown } from './bookshelf-export'

export type BookshelfMessage = { type: 'bookshelf' } & (
  | { action: 'status'; key?: string }
  | { action: 'pageHighlights' }
  | { action: 'unhighlight'; url: string; ids: number[] }
  | { action: 'save'; metadata: BookshelfMetadata; markdown?: string; archiveOnly?: boolean }
  | { action: 'highlight'; url: string; text: string; paragraphId?: string; occurrence?: number }
  | { action: 'read'; key: string; read: boolean }
  | { action: 'delete'; key: string }
  | { action: 'undo'; token: string }
  | { action: 'note'; id: number; note: string }
  | { action: 'obsidian'; key: string }
)
const undo = new Map<string, { bundle: BookshelfDeleted; expires: number }>()
const trustedExtension = (sender: chrome.runtime.MessageSender): boolean => {
  const url = sender.url?.split(/[?#]/)[0]
  return ['popup.html', 'options.html', 'tabs/bookshelf.html'].some(path => url === chrome.runtime.getURL(path))
}
const storyKey = (sender: chrome.runtime.MessageSender, url: string, customHosts: readonly string[]): string => {
  const key = mediumPostId(url, customHosts)
  if (!sender.tab || (sender.frameId !== undefined && sender.frameId !== 0) || !key || mediumPostId(sender.url || '', customHosts) !== key) {
    throw new Error('Bookshelf capture must come from the story you are viewing.')
  }
  return key
}
export const handleBookshelfMessage = async (message: BookshelfMessage, sender: chrome.runtime.MessageSender): Promise<any> => {
  const { bookshelfEnabled: enabled } = await chrome.storage.local.get({ bookshelfEnabled: true })
  const customHosts = await readCustomMediumHosts()
  const pro = await isPro()
  if (message.action === 'status') {
    const key = trustedExtension(sender) ? message.key : storyKey(sender, sender.url || '', customHosts)
    const item = key ? await getBookshelfItem(key) : undefined
    return { ok: true, enabled, pro, saved: !!item, archived: !!item?.markdown }
  }
  if (message.action === 'pageHighlights') {
    // Read-only and scoped to the story the sender is showing. Free users and a
    // disabled Bookshelf get an empty list, not an error: the page just stays plain.
    const key = storyKey(sender, sender.url || '', customHosts)
    if (!enabled || !pro) return { ok: true, highlights: [] }
    const list = await getBookshelfHighlights(key)
    return { ok: true, highlights: list.map(({ id, text, paragraphId, occurrence }) => ({ id, text, paragraphId, occurrence: occurrence || 0 })) }
  }
  if (message.action === 'unhighlight') {
    // Removing your own highlight is not gated by Pro; it is scoped to the story you are on.
    const key = storyKey(sender, message.url, customHosts)
    const ids = Array.isArray(message.ids) ? [...new Set(message.ids.filter(id => Number.isSafeInteger(id)))].slice(0, 50) : []
    if (!ids.length) throw new Error('No highlight selected.')
    for (const id of ids) await deleteBookshelfHighlight(id, key)
    return { ok: true, removed: ids.length }
  }
  if (message.action === 'save' || message.action === 'highlight') {
    if (!enabled) throw new Error('Bookshelf is disabled in Options.')
    const url = message.action === 'save' ? message.metadata?.url : message.url
    const key = storyKey(sender, url, customHosts)
    if (message.action === 'highlight') {
      const h = normalizeHighlight(key, message, pro)
      await addBookshelfHighlight(h)
      return { ok: true }
    }
    if (message.archiveOnly) requireBookshelfPro(pro)
    let archived = false
    await saveBookshelfItem(key, existing => {
      if (message.archiveOnly && !existing) throw new Error('Save this story first.')
      let item = normalizeItem(message.metadata, existing, Date.now(), customHosts)
      if (pro && message.markdown !== undefined) { item = archiveItem(item, message.markdown, pro); archived = true }
      if (message.archiveOnly && !archived) throw new Error('No rendered article content to archive.')
      return item
    })
    return { ok: true, archived }
  }
  if (!trustedExtension(sender)) throw new Error('This operation requires an extension page.')
  switch (message.action) {
    case 'read':
      await saveBookshelfItem(message.key, item => {
        if (!item) throw new Error('Story no longer exists.')
        return { ...item, readAt: message.read ? Date.now() : null }
      })
      return { ok: true }
    case 'delete': {
      const bundle = await deleteBookshelfItem(message.key)
      for (const [token, value] of undo) if (value.expires < Date.now()) undo.delete(token)
      const token = crypto.randomUUID()
      undo.set(token, { bundle, expires: Date.now() + 15000 })
      return { ok: true, token }
    }
    case 'undo': {
      const deleted = undo.get(message.token)
      if (!deleted || deleted.expires < Date.now()) { undo.delete(message.token); throw new Error('Undo has expired.') }
      await restoreBookshelfItem(deleted.bundle)
      undo.delete(message.token)
      return { ok: true }
    }
    case 'note':
      requireBookshelfPro(pro)
      if (!Number.isSafeInteger(message.id) || typeof message.note !== 'string') throw new Error('Invalid note.')
      await updateBookshelfNote(message.id, message.note)
      return { ok: true }
    case 'obsidian': {
      requireBookshelfPro(pro)
      const settings = await chrome.storage.local.get({ obsidianClipperEnabled: false })
      if (!settings.obsidianClipperEnabled) throw new Error('Enable Save to Obsidian in Options first.')
      // One story: read it and its highlights, not the whole library.
      const item = await getBookshelfItem(message.key)
      if (!item) throw new Error('Story no longer exists.')
      const highlights = await getBookshelfHighlights(message.key)
      return { ok: true, clip: { title: item.title, author: item.author, domain: new URL(item.url).hostname, markdown: exportMarkdown(item, highlights, pro) } }
    }
    default: throw new Error('Unknown Bookshelf action.')
  }
}
