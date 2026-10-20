import assert from 'node:assert/strict'
import { event, loadSource } from './load-source.ts'

const changed = event()
const reads: { defaults: any; callback: (items: any) => void }[] = []
const hover: boolean[] = []
let resets = 0
let selfCiteMounted = 0
let storyRoot: object | null = null
let checkUrl: () => void
const window = {
  top: null as any,
  location: { href: 'https://medium.com/p/abcdef123456' },
  addEventListener: () => {},
  setInterval: (callback: () => void) => { checkUrl = callback },
}
window.top = window

try {
  loadSource('src/contents/index.ts', {
    window,
    chrome: {
      runtime: { onMessage: event() },
      storage: { onChanged: changed, local: { get: (defaults: any, callback: (items: any) => void) => reads.push({ defaults, callback }) } },
    },
  }, {
    './lib/bookshelf': {},
    './lib/inpage-highlights': { applyInPageHighlights: async () => {}, clearInPageHighlights: () => {}, setInPageHighlightsEnabled: () => {} },
    './util/toast': {}, './ui/ai-presets': {}, './lib/extract': {},
    './ui/summary-panel': { disposePanel: () => {} },
    './ui/quote-card-panel': {
      mountQuoteCardButton: () => {}, setQuoteCardHoverEnabled: (value: boolean) => hover.push(value),
      resetQuoteCard: () => { resets++ },
    },
    './ui/self-cite-panel': { mountSelfCiteBall: () => { selfCiteMounted++ }, unmountSelfCiteBall: () => {} },
    './markdown/medium-to-markdown': {}, '../shared/obsidian-clip': {},
    './lib/quote-card': { quoteStoryRoot: () => storyRoot },
  })
  assert.equal(reads[0].defaults.quoteCardHoverEnabled, true, 'hover enabled by default')
  reads.shift()!.callback({ selfCiteEnabled: false, quoteCardHoverEnabled: true })
  assert.equal(hover.at(-1), true)
  changed.emit({ quoteCardHoverEnabled: { newValue: false } }, 'sync')
  assert.equal(hover.at(-1), true, 'sync changes do not affect local toggle')
  changed.emit({ quoteCardHoverEnabled: { newValue: false } }, 'local')
  assert.equal(hover.at(-1), false, 'disable takes effect before async storage read')
  const stale = reads.shift()!
  changed.emit({ quoteCardHoverEnabled: { newValue: true } }, 'local')
  stale.callback({ selfCiteEnabled: false, quoteCardHoverEnabled: false })
  assert.equal(hover.at(-1), true, 'stale storage read cannot undo newer setting')
  reads.shift()!.callback({ selfCiteEnabled: false, quoteCardHoverEnabled: true })
  assert.equal(selfCiteMounted, 0, 'hover changes preserve disabled self-citation setting')
  changed.emit({ quoteCardHoverEnabled: {} }, 'local')
  assert.equal(hover.at(-1), true, 'removing option restores true default')
  reads.shift()!.callback({ selfCiteEnabled: false, quoteCardHoverEnabled: true })
  storyRoot = {}
  checkUrl!()
  assert.equal(resets, 1, 'late story DOM clears stale state')
  assert.equal(reads.length, 1, 'story root arriving after the URL reloads feature settings')
  reads.shift()!.callback({ selfCiteEnabled: false, quoteCardHoverEnabled: true })
  window.location.href = 'https://medium.com/@writer'
  checkUrl!()
  assert.equal(resets, 2, 'SPA URL change resets quote card hover')
  assert.equal(reads.length, 1, 'SPA navigation reloads feature settings')
  console.log('PASS quote hover settings: default, live changes, stale reads, independent toggles and SPA reset')
} catch (error) {
  console.error('FAIL quote hover settings:', error)
  process.exit(1)
}
