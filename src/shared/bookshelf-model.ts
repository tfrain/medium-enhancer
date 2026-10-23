import { mediumPostId } from './medium-url'

export type BookshelfMetadata = {
  url: string
  canonicalUrl?: string
  title: string
  author?: string
  publication?: string
  subtitle?: string
}
export type BookshelfItem = {
  key: string
  postId: string | null
  url: string
  title: string
  author: string
  publication: string
  subtitle: string
  savedAt: number
  readAt: number | null
  tags: string[]
  markdown?: string
  wordCount?: number
  capturedAt?: number
}
export type BookshelfHighlight = {
  id?: number
  itemKey: string
  text: string
  paragraphId: string
  occurrence?: number
  note?: string
  createdAt: number
}
export type BookshelfEntry = BookshelfItem & { hasArchive: boolean; highlightCount: number }

export const requireBookshelfPro = (pro: boolean): void => {
  if (!pro) throw new Error('Pro is required for this Bookshelf feature.')
}
const clean = (value: unknown): string => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''

export const normalizeItem = (metadata: BookshelfMetadata, existing?: BookshelfItem, now = Date.now(), customHosts: readonly string[] = []): BookshelfItem => {
  const postId = mediumPostId(metadata.url, customHosts)
  if (!postId) throw new Error('Open a supported Medium story to save it.')
  // The URL becomes an href on the Bookshelf page: store web URLs only.
  const web = (value?: string) => { try { return !!value && /^https?:$/.test(new URL(value).protocol) } catch { return false } }
  if (!web(metadata.url)) throw new Error('Open a supported Medium story to save it.')
  const canonical = web(metadata.canonicalUrl) && mediumPostId(metadata.canonicalUrl!, customHosts) === postId ? metadata.canonicalUrl! : metadata.url
  const url = new URL(canonical)
  url.search = ''
  url.hash = ''
  return {
    ...(existing?.key === postId ? existing : {}),
    key: postId, postId, url: url.href,
    title: clean(metadata.title) || 'Untitled story',
    author: clean(metadata.author), publication: clean(metadata.publication), subtitle: clean(metadata.subtitle),
    savedAt: existing?.savedAt ?? now, readAt: existing?.readAt ?? null, tags: existing?.tags ?? [],
  }
}

export const archiveItem = (item: BookshelfItem, markdown: string, pro: boolean, now = Date.now()): BookshelfItem => {
  requireBookshelfPro(pro)
  if (typeof markdown !== 'string' || !markdown.trim()) throw new Error('Cannot archive empty content.')
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n)?/, '').trim()
  return { ...item, markdown, wordCount: body ? body.split(/\s+/u).length : 0, capturedAt: now }
}

export const normalizeHighlight = (itemKey: string, value: { text: string; paragraphId?: string; occurrence?: number; note?: string }, pro: boolean, now = Date.now()): BookshelfHighlight => {
  requireBookshelfPro(pro)
  const text = clean(value.text)
  if (!text) throw new Error('Select text inside the story first.')
  return { itemKey, text, paragraphId: /^[0-9a-f]{4}$/.test(value.paragraphId || '') ? value.paragraphId! : '',
    occurrence: Number.isInteger(value.occurrence) && value.occurrence! >= 0 && value.occurrence! < 10000 ? value.occurrence : 0, note: typeof value.note === 'string' ? value.note : '', createdAt: now }
}
