import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

const { isQuoteHoverBlock, quoteHoverPosition } = loadSource('src/shared/quote-hover.ts', {})

// Minimal element boundary: selector matching stays in the DOM; eligibility is real code.
const block = (tag = 'p', attrs: Record<string, string> = { id: 'a1b2' }, text = 'A whole paragraph.', ancestor = '') => ({
  textContent: text,
  matches: (selector: string) => selector.split(', ').includes(tag),
  hasAttribute: (name: string) => name in attrs,
  closest: (selector: string) => ancestor && selector.includes(ancestor) ? {} : null,
}) as unknown as Element
const article = { contains: (node: Element) => node !== outside } as Element
const outside = block()
const viewport = { width: 800, height: 600 }
const rect = (left: number, top = 100, right = 700, bottom = 150) => ({ left, top, right, bottom })

try {
  assert.equal(isQuoteHoverBlock(block(), article), true, 'p with id is eligible')
  assert.equal(isQuoteHoverBlock(block('li'), article), true, 'list item is eligible')
  for (const tag of ['blockquote', 'h2', 'h3', 'h4']) assert.equal(isQuoteHoverBlock(block(tag), article), true)
  assert.equal(isQuoteHoverBlock(block('p', { 'data-selectable-paragraph': '' }), article), true)
  assert.equal(isQuoteHoverBlock(block('p', {}), article), false, 'requires paragraph marker')
  assert.equal(isQuoteHoverBlock(outside, article), false, 'must belong to story article')
  for (const tag of ['pre', 'figcaption', 'div']) assert.equal(isQuoteHoverBlock(block(tag), article), false)
  for (const ancestor of ['pre', 'figcaption', '[contenteditable="true"]', '[class*="editor" i]', '[class*="response" i]']) {
    assert.equal(isQuoteHoverBlock(block('p', { id: 'a1b2' }, 'Text', ancestor), article), false, `excludes ${ancestor}`)
  }
  assert.equal(isQuoteHoverBlock(block('p', { id: 'a1b2' }, ' \n\t '), article), false, 'empty text is excluded')
  assert.deepEqual({ ...quoteHoverPosition(rect(100), viewport) }, { left: 68, top: 102 }, 'left gutter')
  assert.deepEqual({ ...quoteHoverPosition(rect(36), viewport) }, { left: 4, top: 102 }, 'gutter threshold')
  assert.deepEqual({ ...quoteHoverPosition(rect(20), viewport) }, { left: 672, top: 74 }, 'narrow fallback')
  assert.deepEqual({ ...quoteHoverPosition(rect(20, 8), viewport) }, { left: 672, top: 4 }, 'fallback clamps to viewport top')
  assert.deepEqual({ ...quoteHoverPosition(rect(20, -10), viewport) }, { left: 672, top: 4 }, 'partly visible block')
  for (const bounds of [rect(100, 600, 700, 650), rect(100, -50, 700, 0), rect(800, 100, 850), rect(-50, 100, 0), rect(10, 100, 10)]) {
    assert.equal(quoteHoverPosition(bounds, viewport), null, 'offscreen or zero width blocks are hidden')
  }
  console.log('PASS quote hover: block eligibility, exclusions, position, clamp and viewport visibility')
} catch (error) {
  console.error('FAIL quote hover:', error)
  process.exit(1)
}
