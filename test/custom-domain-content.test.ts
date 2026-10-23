import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'
const article = {}
const window = { location: { href: 'https://pub.huizhou92.com/story-b61d5eda73ec' } }
const document = { querySelector: () => article }
// Load through one module graph so the content host state is shared.
const api = loadSource('src/contents/lib/quote-card.ts', { window, document })
assert.equal(api.quoteStoryRoot(), null, 'unknown host is not trusted')
// The entrypoint supplies enabled hosts when it loads feature settings.
assert.equal(typeof api.setCustomMediumHosts, 'function', 'content settings can supply enabled hosts')
api.setCustomMediumHosts(['pub.huizhou92.com'])
assert.equal(api.quoteStoryRoot(), article)
api.setCustomMediumHosts([])
assert.equal(api.quoteStoryRoot(), null, 'removal disables story features in the open page')
console.log('PASS custom domain content story detection and removal')
