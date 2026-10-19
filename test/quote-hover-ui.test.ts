import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

class Surface {
  listeners = new Map<string, Set<(event: any) => void>>()
  options = new Map<string, any>()
  addEventListener(name: string, fn: (event: any) => void, options?: any) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set())
    this.listeners.get(name)!.add(fn)
    this.options.set(name, options)
  }
  removeEventListener(name: string, fn: (event: any) => void) { this.listeners.get(name)?.delete(fn) }
  emit(name: string, event: any = {}) { for (const fn of this.listeners.get(name) || []) fn(event) }
}
class FakeElement extends Surface {
  id = ''; textContent = 'The entire paragraph, including its second sentence.'
  style: any = {}; hidden = false; isConnected = true
  attributes: Record<string, string> = {}
  children: FakeElement[] = []
  rect = { left: 100, top: 100, right: 700, bottom: 150 }
  tag: string
  parentElement: FakeElement | null
  constructor(tag = 'p', parentElement: FakeElement | null = null) { super(); this.tag = tag; this.parentElement = parentElement }
  matches(selector: string) { return selector.split(', ').includes(this.tag) }
  hasAttribute(name: string) { return name === 'id' ? !!this.id : name in this.attributes }
  setAttribute(name: string, value: string) { this.attributes[name] = value }
  closest(selector: string): FakeElement | null { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null }
  contains(node: FakeElement): boolean { return node === this || !!node?.parentElement && this.contains(node.parentElement) }
  appendChild(node: FakeElement) { this.children.push(node); node.parentElement = this; return node }
  remove() { this.isConnected = false; if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(n => n !== this) }
  getBoundingClientRect() { return this.rect }
}
const frames = new Map<number, () => void>()
const timers = new Map<number, { fn: () => void; delay: number }>()
let nextId = 0
const document = Object.assign(new Surface(), {
  body: new FakeElement('body'),
  createElement: (tag: string) => new FakeElement(tag),
})
const article = document.body.appendChild(new FakeElement('article'))
const paragraph = article.appendChild(new FakeElement())
paragraph.id = 'a1b2'
const inline = paragraph.appendChild(new FakeElement('em'))
let story: FakeElement | null = article
let selection = { isCollapsed: true }
let blocked = false
const window = Object.assign(new Surface(), {
  innerWidth: 800, innerHeight: 600, location: { href: 'https://medium.com/p/abcdef123456' },
  getSelection: () => selection,
  requestAnimationFrame: (fn: () => void) => { frames.set(++nextId, fn); return nextId },
  cancelAnimationFrame: (id: number) => frames.delete(id),
  setTimeout: (fn: () => void, delay: number) => { timers.set(++nextId, { fn, delay }); return nextId },
  clearTimeout: (id: number) => timers.delete(id),
})
const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()) }
const hover = (target: FakeElement) => { document.emit('mouseover', { target }); flush() }
const icon = () => document.body.children.find(node => node.id === '__me_quote_card_hover__')!
const opened: any[] = []
let fallback: any

try {
  const { createQuoteHover } = loadSource('src/contents/ui/quote-hover.ts', { window, document, Element: FakeElement }, {
    '../lib/quote-card': {
      quoteStoryRoot: () => story,
      readQuoteCard: (node: any) => { fallback = node; return { quote: paragraph.textContent } },
    },
  })
  const control = createQuoteHover((card: any) => opened.push(card), () => blocked)
  control.setEnabled(false)
  assert.equal(document.listeners.get('mouseover')?.size || 0, 0, 'off mounts no hover listener')
  story = null
  control.setEnabled(true)
  assert.equal(document.listeners.get('mouseover')?.size || 0, 0, 'non-story mounts no hover listener')
  story = article
  control.setEnabled(true)
  control.setEnabled(true)
  assert.equal(document.listeners.get('mouseover')?.size, 1, 'exactly one delegated hover listener')
  assert.equal(document.options.get('mouseover').passive, true)
  document.emit('mouseover', { target: inline })
  document.emit('mouseover', { target: paragraph })
  assert.equal(frames.size, 1, 'pointer work is rAF throttled')
  flush()
  assert.equal(icon().hidden, false)
  assert.equal(icon().attributes['aria-label'], 'Make a quote card from this paragraph')
  assert.equal(icon().style.left, '68px')
  hover(document.body)
  assert.equal([...timers.values()][0].delay, 300)
  hover(icon())
  assert.equal(timers.size, 0, 'entering icon cancels delayed hide')
  hover(document.body)
  hover(inline)
  assert.equal(timers.size, 0, 'entering paragraph cancels delayed hide')
  window.emit('scroll')
  document.emit('mouseover', { target: document.body })
  flush()
  assert.equal(timers.size, 1, 'leaving during a pending scroll frame still schedules hide')
  hover(paragraph)
  let prevented = false
  ;(icon() as any).onmousedown({ preventDefault: () => { prevented = true } })
  assert.equal(prevented, true)
  ;(icon() as any).onclick()
  assert.equal(fallback, paragraph, 'whole paragraph is passed, not an inline fragment')
  assert.equal(opened[0].quote, 'The entire paragraph, including its second sentence.')
  assert.equal(icon().hidden, true)
  hover(paragraph)
  paragraph.rect.top = 40
  window.emit('scroll')
  window.emit('resize')
  assert.equal(frames.size, 1)
  flush()
  assert.equal(icon().style.top, '42px', 'scroll/resize repositions icon')
  paragraph.rect.bottom = -1
  paragraph.rect.top = -50
  window.emit('scroll'); flush()
  assert.equal(icon().hidden, true, 'offscreen paragraph hides icon')
  paragraph.rect = { left: 100, top: 100, right: 700, bottom: 150 }
  selection.isCollapsed = false
  hover(paragraph)
  assert.equal(icon().hidden, true, 'selection wins')
  selection.isCollapsed = true
  blocked = true
  hover(paragraph)
  assert.equal(icon().hidden, true, 'panel wins')
  blocked = false
  hover(paragraph)
  document.emit('mouseleave'); flush()
  const pending = [...timers.values()]; timers.clear(); pending.forEach(timer => timer.fn())
  assert.equal(icon().hidden, true, 'leaving document hides after delay')
  hover(paragraph)
  hover(document.body)
  control.reset()
  assert.equal(icon(), undefined, 'SPA reset removes icon')
  assert.equal(timers.size, 0)
  assert.equal(frames.size, 0)
  assert.equal(document.listeners.get('mouseover')?.size, 0)
  control.setEnabled(true)
  hover(paragraph)
  control.setEnabled(false)
  assert.equal(icon(), undefined, 'live disable removes icon')
  assert.equal(document.listeners.get('mouseover')?.size, 0)
  console.log('PASS quote hover UI: delegation, throttling, delay, click, selection/panel guards, repositioning, settings and SPA cleanup')
} catch (error) {
  console.error('FAIL quote hover UI:', error)
  process.exit(1)
}
