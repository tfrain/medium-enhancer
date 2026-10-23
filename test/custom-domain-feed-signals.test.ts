import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'
const anchor = { href: 'https://medium.com/@hxzhouh/following?source=post_page', textContent: 'Author', closest: (s: string) => s === 'article, main' ? {} : null }
const { collectFeedSignals } = loadSource('src/contents/lib/feed-signals.ts', {
  document: { querySelector: () => null, querySelectorAll: (s: string) => s === 'a[href*="/@"]' ? [anchor] : [] },
})
assert.equal(collectFeedSignals().authorProfileLinks[0]?.href, anchor.href, 'author following link reaches background feed computation')
console.log('PASS custom domain author following feed signal')
