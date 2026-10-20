import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

const mod = loadSource('src/shared/highlight-locate.ts', {})
// loadSource evaluates in a vm realm; copy results into this realm before deepStrictEqual.
const local = (v: any) => (v == null ? v : JSON.parse(JSON.stringify(v)))
const locateText = (hay: string, needle: string) => local(mod.locateText(hay, needle))
const collapseSpace = mod.collapseSpace

// Exact text.
assert.deepEqual(locateText('Alpha beta gamma.', 'beta'), [6, 10])
// The saved text has collapsed spaces; the page has a newline and a no-break space.
const page = 'One\n  two three four'
const hit = locateText(page, 'two three four')
assert.deepEqual(hit, [6, 20])
assert.equal(collapseSpace(page.slice(hit[0], hit[1])), 'two three four')
// Saved text spanning a line break between inline elements.
assert.deepEqual(locateText('end of one\nstart of two', 'one start'), [7, 16])
// Leading/trailing whitespace in the paragraph does not shift offsets.
assert.deepEqual(locateText('\n   Lead text here', 'text'), [9, 13])
// First occurrence wins; missing and empty needles return null.
assert.deepEqual(locateText('dup and dup', 'dup'), [0, 3])
assert.equal(locateText('nothing here', 'absent'), null)
assert.equal(locateText('anything', '   '), null)

// Service: pageHighlights is read-only, story-scoped, and empty for free users.
let pro = false
let enabled = true
const stored = [
  { id: 1, itemKey: 'abcdef123456', text: 'first passage', paragraphId: 'a1b2', note: 'why it matters', createdAt: 1 },
  { id: 2, itemKey: 'abcdef123456', text: 'second passage', paragraphId: '', createdAt: 2 },
  { id: 3, itemKey: '999999999999', text: 'other story', paragraphId: 'c3d4', createdAt: 3 },
]
const db = {
  getBookshelfHighlights: async (key: string) => stored.filter(h => h.itemKey === key),
  getBookshelfItem: async () => undefined, listBookshelf: async () => ({ items: [], highlights: [] }),
  saveBookshelfItem: async () => { throw new Error('unused') }, addBookshelfHighlight: async () => { throw new Error('unused') },
  updateBookshelfNote: async () => {}, deleteBookshelfItem: async () => ({ highlights: [] }), restoreBookshelfItem: async () => {},
}
const chrome = { runtime: { getURL: (p: string) => 'chrome-extension://test/' + p }, storage: { local: { get: async () => ({ bookshelfEnabled: enabled }) } } }
const { handleBookshelfMessage: handle } = loadSource('src/shared/bookshelf-service.ts', { chrome, crypto, Date }, {
  './bookshelf-db': db, './pro': { isPro: async () => pro },
})
const url = 'https://medium.com/@writer/story-abcdef123456'
const sender = { tab: { id: 1, url }, url, frameId: 0 }
const ask = async (from: any = sender) => local(await handle({ type: 'bookshelf', action: 'pageHighlights' }, from))

assert.deepEqual((await ask()).highlights, [], 'free users get no marks')
pro = true
const got = (await ask()).highlights
assert.deepEqual(got.map((h: any) => h.id), [1, 2], 'only this story')
assert.deepEqual(Object.keys(got[0]).sort(), ['id', 'note', 'paragraphId', 'text'], 'no itemKey/createdAt leak to the page')
assert.equal(got[1].note, '', 'missing note becomes empty string')
await assert.rejects(() => ask({ ...sender, frameId: 2 }), /story/i, 'iframes cannot read highlights')
await assert.rejects(() => ask({ url: 'https://evil.example/', tab: { id: 9 } }), /story/i, 'non-story senders cannot read highlights')
enabled = false
assert.deepEqual((await ask()).highlights, [], 'disabled Bookshelf leaves the page plain')

console.log('PASS in-page highlights: whitespace-tolerant locate, story-scoped Pro-only pageHighlights')
