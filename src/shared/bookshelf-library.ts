// Extension pages share the extension-origin DB with the worker. Read large
// libraries here rather than serializing archives through runtime messages.
import { isPro } from './pro'
import { listBookshelf } from './bookshelf-db'
import { exportFiles } from './bookshelf-export'
import { requireBookshelfPro, type BookshelfEntry, type BookshelfHighlight } from './bookshelf-model'

export type BookshelfLibrary = { items: BookshelfEntry[]; highlights: BookshelfHighlight[]; pro: boolean; enabled: boolean }
export const readBookshelfLibrary = async (): Promise<BookshelfLibrary> => {
  const { items, highlights } = await listBookshelf()
  const pro = await isPro()
  const { bookshelfEnabled } = await chrome.storage.local.get({ bookshelfEnabled: true })
  const counts = new Map<string, number>()
  for (const h of highlights) counts.set(h.itemKey, (counts.get(h.itemKey) || 0) + 1)
  return { pro, enabled: bookshelfEnabled, items: items.map(item => {
    const { markdown, wordCount, capturedAt, ...metadata } = item
    return { ...metadata, ...(pro ? { markdown, wordCount, capturedAt } : {}), hasArchive: !!markdown, highlightCount: counts.get(item.key) || 0 }
  }), highlights: pro ? highlights : [] }
}
export const exportBookshelfFiles = async () => {
  requireBookshelfPro(await isPro())
  const { items, highlights } = await listBookshelf()
  // A large local read can cross the key's expiry boundary.
  const pro = await isPro()
  return exportFiles(items, highlights, pro)
}
