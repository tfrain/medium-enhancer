import type { BookshelfItem, BookshelfHighlight } from './bookshelf-model'

const DB_NAME = 'medium-enhancer-bookshelf'
const DB_VERSION = 1
let opening: Promise<IDBDatabase> | undefined

// Append version steps here; never rewrite a released migration.
export const migrateBookshelf = (db: IDBDatabase, oldVersion: number): void => {
  if (oldVersion < 1) {
    db.createObjectStore('items', { keyPath: 'key' })
    db.createObjectStore('highlights', { keyPath: 'id', autoIncrement: true }).createIndex('itemKey', 'itemKey')
  }
}
const openBookshelf = (): Promise<IDBDatabase> => {
  if (opening) return opening
  opening = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    let blocked = false
    request.onupgradeneeded = event => migrateBookshelf(request.result, event.oldVersion)
    request.onerror = () => reject(request.error || new Error('Could not open Bookshelf.'))
    request.onblocked = () => { blocked = true; reject(new Error('Close other Bookshelf tabs and try again.')) }
    request.onsuccess = () => {
      const db = request.result
      if (blocked) { db.close(); return }
      db.onversionchange = () => { db.close(); opening = undefined }
      resolve(db)
    }
  }).catch(error => { opening = undefined; throw error })
  return opening
}
const resultOf = <T>(request: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result)
  request.onerror = () => reject(request.error || new Error('Bookshelf request failed.'))
})
const transaction = async <T>(stores: string[], mode: IDBTransactionMode, work: (tx: IDBTransaction) => Promise<T>): Promise<T> => {
  const db = await openBookshelf()
  const tx = db.transaction(stores, mode)
  const done = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = () => reject(tx.error || new Error('Bookshelf transaction was aborted.'))
    tx.onerror = () => { /* onabort reports the final transaction outcome */ }
  })
  // A transaction may abort before work's request rejects.
  void done.catch(() => {})
  try {
    const value = await work(tx)
    await done
    return value
  } catch (error) {
    try { tx.abort() } catch { /* already complete/aborted */ }
    await done.catch(() => {})
    throw error
  }
}
export const getBookshelfItem = (key: string): Promise<BookshelfItem | undefined> =>
  transaction(['items'], 'readonly', tx => resultOf(tx.objectStore('items').get(key)))

export const listBookshelf = (): Promise<{ items: BookshelfItem[]; highlights: BookshelfHighlight[] }> =>
  transaction(['items', 'highlights'], 'readonly', async tx => {
    const [items, highlights] = await Promise.all([
      resultOf<BookshelfItem[]>(tx.objectStore('items').getAll()),
      resultOf<BookshelfHighlight[]>(tx.objectStore('highlights').getAll()),
    ])
    return { items: items.sort((a, b) => b.savedAt - a.savedAt), highlights }
  })

// Read/merge/write in one transaction prevents concurrent re-saves losing data.
export const getBookshelfHighlights = (itemKey: string): Promise<BookshelfHighlight[]> =>
  transaction(['highlights'], 'readonly', tx => resultOf<BookshelfHighlight[]>(tx.objectStore('highlights').index('itemKey').getAll(itemKey)))

export const saveBookshelfItem = (key: string, update: (existing?: BookshelfItem) => BookshelfItem): Promise<BookshelfItem> =>
  transaction(['items'], 'readwrite', async tx => {
    const store = tx.objectStore('items')
    const item = update(await resultOf(store.get(key)))
    await resultOf(store.put(item))
    return item
  })

export const addBookshelfHighlight = (highlight: BookshelfHighlight): Promise<BookshelfHighlight> =>
  transaction(['items', 'highlights'], 'readwrite', async tx => {
    if (!await resultOf(tx.objectStore('items').get(highlight.itemKey))) throw new Error('Save this story first.')
    const id = await resultOf(tx.objectStore('highlights').add(highlight))
    return { ...highlight, id: Number(id) }
  })

export const updateBookshelfNote = (id: number, note: string): Promise<void> =>
  transaction(['highlights'], 'readwrite', async tx => {
    const store = tx.objectStore('highlights')
    const highlight: BookshelfHighlight | undefined = await resultOf(store.get(id))
    if (!highlight) throw new Error('Highlight no longer exists.')
    await resultOf(store.put({ ...highlight, note }))
  })
export type BookshelfDeleted = { item?: BookshelfItem; highlights: BookshelfHighlight[] }
export const deleteBookshelfItem = (key: string): Promise<BookshelfDeleted> =>
  transaction(['items', 'highlights'], 'readwrite', async tx => {
    const items = tx.objectStore('items')
    const highlights = tx.objectStore('highlights')
    const [item, saved] = await Promise.all([
      resultOf<BookshelfItem | undefined>(items.get(key)),
      resultOf<BookshelfHighlight[]>(highlights.index('itemKey').getAll(key)),
    ])
    await Promise.all([resultOf(items.delete(key)), ...saved.map(h => resultOf(highlights.delete(h.id!)))])
    return { item, highlights: saved }
  })
export const restoreBookshelfItem = (bundle: BookshelfDeleted): Promise<void> =>
  transaction(['items', 'highlights'], 'readwrite', async tx => {
    if (!bundle.item) return
    const items = tx.objectStore('items')
    const highlights = tx.objectStore('highlights')
    const existing: BookshelfItem | undefined = await resultOf(items.get(bundle.item.key))
    await resultOf(items.put({ ...bundle.item, ...existing }))
    for (const highlight of bundle.highlights) {
      // Preserve a note edited after another restore; IDs are never recycled.
      if (!await resultOf(highlights.get(highlight.id!))) await resultOf(highlights.put(highlight))
    }
  })
