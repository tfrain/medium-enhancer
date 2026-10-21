import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'
const pending: ((v: any) => void)[] = []
const kept: string[] = []
const article = { isConnected: true, querySelectorAll: () => [] }
const mod = loadSource('src/contents/lib/inpage-highlights.ts', {
  window: { clearTimeout() {} },
  document: {
    addEventListener() {}, getElementById: () => ({}),
    querySelectorAll: () => [{ dataset: { meHl: 'new' }, get parentNode() { kept.push('removed'); return null } }],
  },
  MutationObserver: class { observe() {} takeRecords() {} disconnect() {} },
}, {
  '../../shared/bookshelf-client': { bookshelfRequest: () => new Promise(resolve => pending.push(resolve)) },
  './quote-card': { quoteStoryRoot: () => article },
})
mod.setInPageHighlightsEnabled(true)
const latest = mod.applyInPageHighlights()
pending[1]({ highlights: [{ id: 'new', text: 'new' }] })
await latest
kept.length = 0
pending[0]({ highlights: [] })
await new Promise(resolve => setImmediate(resolve))
assert.deepEqual(kept, [], 'older response must not erase newer marks')
const cleared = mod.applyInPageHighlights()
mod.clearInPageHighlights()
kept.length = 0
pending[2]({ highlights: [] })
await cleared
assert.deepEqual(kept, [], 'cleanup invalidates pending refresh')
console.log('PASS latest highlight refresh wins and cleanup invalidates pending responses')
