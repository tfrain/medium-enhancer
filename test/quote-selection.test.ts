import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

const story = 'https://medium.com/@writer/story-abcdef123456'
const block = { id: 'a1b2', textContent: 'Story text', parentElement: null }
const excluded = { textContent: 'A response' }
const element = (insideNoise = false) => ({
  nodeType: 1, id: '', parentElement: block,
  closest: (selector: string) => selector.startsWith('p, li') ? block : insideNoise ? excluded : null,
})
let start = element()
let end = element()
let crossesNoise = false
const range = { collapsed: false, get startContainer() { return start }, get endContainer() { return end }, intersectsNode: (node: any) => node === excluded && crossesNoise }
const article = {
  contains: (node: any) => [start, end, block].includes(node),
  querySelectorAll: () => [excluded],
  querySelector: () => null,
}
const selection = { rangeCount: 1, getRangeAt: () => range, toString: () => 'Story text and more' }
try {
  const { readQuoteCard } = loadSource('src/contents/lib/quote-card.ts', {
    Node: { ELEMENT_NODE: 1 },
    document: { title: 'Story', querySelector: (selector: string) => selector === 'article' ? article : null },
    window: { location: { href: story }, getSelection: () => selection },
  })
  assert.ok(readQuoteCard(), 'ordinary story selection is accepted')
  end = element(true)
  assert.equal(readQuoteCard(), null, 'excluded end rejects a selection starting in story text')
  start = element(true)
  end = element()
  assert.equal(readQuoteCard(), null, 'excluded start rejects a selection ending in story text')
  start = element()
  crossesNoise = true
  assert.equal(readQuoteCard(), null, 'excluded subtree between two valid endpoints rejects the range')
  crossesNoise = false
  assert.ok(readQuoteCard())
  range.collapsed = true
  assert.equal(readQuoteCard(start).quote, 'Story text', 'collapsed selection uses the entire fallback paragraph')
  range.collapsed = false
  assert.equal(readQuoteCard(start).quote, 'Story text and more', 'non-collapsed selection keeps the existing selection path')
  console.log('PASS quote selections reject excluded starts, ends and intersected subtrees')
} catch (error) {
  console.error('FAIL quote selection:', error)
  process.exit(1)
}
