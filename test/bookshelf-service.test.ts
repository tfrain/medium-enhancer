import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'
let pro = false
let enabled = true
let customMediumHosts: string[] = []
const items = new Map<string, any>()
const highlights: any[] = []
const db = {
  listBookshelf: async () => ({ items: [...items.values()].sort((a, b) => b.savedAt - a.savedAt), highlights: [...highlights] }),
  getBookshelfItem: async (key: string) => items.get(key),
  saveBookshelfItem: async (key: string, update: any) => { const item = update(items.get(key)); items.set(key, item); return item },
  addBookshelfHighlight: async (h: any) => { if (!items.has(h.itemKey)) throw new Error('Save this story first.'); const value = { ...h, id: highlights.length + 1 }; highlights.push(value); return value },
  updateBookshelfNote: async (id: number, note: string) => { const h = highlights.find(h => h.id === id); if (!h) throw new Error('Missing highlight.'); h.note = note },
  deleteBookshelfItem: async (key: string) => { const item = items.get(key); items.delete(key); const saved = highlights.filter(h => h.itemKey === key); for (const h of saved) highlights.splice(highlights.indexOf(h), 1); return { item, highlights: saved } },
  restoreBookshelfItem: async (bundle: any) => { if (!items.has(bundle.item.key)) items.set(bundle.item.key, bundle.item); highlights.push(...bundle.highlights) },
}
const chrome = { runtime: { getURL: (p: string) => 'chrome-extension://test/' + p }, storage: { local: { get: async () => ({ bookshelfEnabled: enabled, customMediumHosts }) } } }
const { handleBookshelfMessage: handle } = loadSource('src/shared/bookshelf-service.ts', { chrome, crypto, Date }, {
  './bookshelf-db': db, './pro': { isPro: async () => pro },
})
const libraryApi = loadSource('src/shared/bookshelf-library.ts', { chrome }, {
  './bookshelf-db': db, './pro': { isPro: async () => pro },
})
const url = 'https://medium.com/@writer/story-abcdef123456'
const sender = { tab: { id: 1, url }, url, frameId: 0 }
const library = { url: 'chrome-extension://test/tabs/bookshelf.html' }
const save = { action: 'save', metadata: { url, title: 'Story' } }
const send = (message: any, from: any = sender) => handle({ type: 'bookshelf', ...message }, from)
await send({ ...save, markdown: 'free tries an archive' })
assert.equal(items.get('abcdef123456').markdown, undefined, 'free save is metadata-only even if markdown supplied')
await assert.rejects(() => send({ action: 'highlight', url, text: 'selection' }), /Pro/)
await assert.rejects(() => libraryApi.exportBookshelfFiles(), /Pro/)
await assert.rejects(() => send({ action: 'note', id: 1, note: 'note' }, library), /Pro/)
await assert.rejects(() => send(save, { ...sender, url: 'https://medium.com/p/111111111111' }), /story/i)
await assert.rejects(() => send(save, { ...sender, frameId: 1 }), /story/i)
await assert.rejects(() => send({ action: 'list' }), /extension/i)
enabled = false
await assert.rejects(() => send(save), /disabled/i)
enabled = true
pro = true
await send({ ...save, archiveOnly: true, markdown: 'archived quokka body' })
const savedAt = items.get('abcdef123456').savedAt
await send({ action: 'highlight', url, text: 'selected words', paragraphId: 'abcd' })
await send({ action: 'note', id: 1, note: 'wombat notes' }, library)
await send({ action: 'read', key: 'abcdef123456', read: true }, library)
await send({ ...save, metadata: { url, title: 'Renamed' } })
assert.equal(items.get('abcdef123456').savedAt, savedAt)
assert.ok(items.get('abcdef123456').readAt)
assert.equal(highlights[0].note, 'wombat notes')
const list = await libraryApi.readBookshelfLibrary()
assert.equal(list.highlights.length, 1)
assert.equal(list.items[0].markdown, 'archived quokka body')
assert.equal((await libraryApi.exportBookshelfFiles()).length, 1)
pro = false
const locked = await libraryApi.readBookshelfLibrary()
assert.equal(locked.items[0].hasArchive, true)
assert.equal(locked.items[0].markdown, undefined)
assert.equal(locked.highlights.length, 0)
await assert.rejects(() => send({ ...save, archiveOnly: true, markdown: 'bad' }), /Pro/)
pro = true
assert.equal((await libraryApi.readBookshelfLibrary()).items[0].markdown, 'archived quokka body')
pro = false
assert.equal((await libraryApi.readBookshelfLibrary()).items[0].markdown, undefined, 'expiry redacts previously loaded content on refresh')
await assert.rejects(() => libraryApi.exportBookshelfFiles(), /Pro/)
const deleted = await send({ action: 'delete', key: 'abcdef123456' }, library)
assert.equal(items.size, 0)
assert.equal(highlights.length, 0)
await send({ action: 'undo', token: deleted.token }, library)
assert.equal(items.size, 1)
assert.equal(highlights[0].note, 'wombat notes')
await assert.rejects(() => send({ action: 'undo', token: deleted.token }, library), /undo/i)
pro = true
await assert.rejects(() => send({ ...save, archiveOnly: true, metadata: { url: 'https://medium.com/p/111111111111', title: 'Other' } }, { ...sender, url: 'https://medium.com/p/111111111111' }), /save/i)
await assert.rejects(() => send({ action: 'highlight', url: 'https://medium.com/p/111111111111', text: 'no saved story' }, { ...sender, url: 'https://medium.com/p/111111111111' }), /save/i)
console.log('PASS Bookshelf background sender, toggle, free/Pro boundaries, redaction, archive, notes, dedupe and delete/undo')

customMediumHosts = ['pub.huizhou92.com']
const customUrl = 'https://pub.huizhou92.com/story-b61d5eda73ec'
await send({ action: 'save', metadata: { url: customUrl, title: 'Custom story' } }, { tab: { id: 2, url: customUrl }, url: customUrl, frameId: 0 })
assert.equal(items.get('b61d5eda73ec').url, customUrl)
customMediumHosts = []
await assert.rejects(() => send({ action: 'status' }, { tab: { id: 2 }, url: customUrl, frameId: 0 }), /story/i)
console.log('PASS custom domain Bookshelf capture and removed-host rejection')
