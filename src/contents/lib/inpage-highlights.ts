import { bookshelfRequest } from '../../shared/bookshelf-client'
import { locateText } from '../../shared/highlight-locate'
import { quoteStoryRoot } from './quote-card'

// Notes are deliberately NOT sent here: anything written into the page DOM
// (a title attribute, a data-* value) is readable by Medium's own scripts.
type PageHighlight = { id?: number; text: string; paragraphId?: string; occurrence?: number }

const MARK_CLASS = 'me-shelf-hl'
const STYLE_ID = '__me_shelf_hl_style__'
const BLOCKS = 'p, li, blockquote, h2, h3, h4, figcaption'
let enabled = false
let generation = 0
let current: PageHighlight[] = []
let observer: MutationObserver | null = null
let repaintTimer = 0

const keyOf = (highlight: PageHighlight) => String(highlight.id ?? highlight.text)

const ensureCSS = () => {
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = `mark.${MARK_CLASS}{background:rgba(255,214,102,.45);color:inherit;border-radius:2px;box-shadow:0 1px 0 rgba(200,150,0,.55)}`
  document.head.appendChild(style)
}

const textNodes = (root: Element): Text[] => {
  const out: Text[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) out.push(node as Text)
  return out
}

const unwrap = (mark: Element) => {
  const parent = mark.parentNode
  if (!parent) return
  while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
  parent.removeChild(mark)
  parent.normalize()
}

// Remove marks, except those whose highlight is still in `keep`.
const removeMarks = (keep?: Set<string>) => {
  document.querySelectorAll(`mark.${MARK_CLASS}`).forEach(mark => {
    if (!keep || !keep.has((mark as HTMLElement).dataset.meHl || '')) unwrap(mark)
  })
}

// Wrap one saved highlight inside one block. Returns false when the text is not
// in this block, so the caller can try the next one. Safe to call repeatedly.
export const markInBlock = (block: Element, highlight: PageHighlight): boolean => {
  const key = keyOf(highlight)
  if (Array.from(block.querySelectorAll(`mark.${MARK_CLASS}`)).some(m => (m as HTMLElement).dataset.meHl === key)) return true
  const nodes = textNodes(block)
  const starts: number[] = []
  let full = ''
  for (const node of nodes) { starts.push(full.length); full += node.data }
  const hit = locateText(full, highlight.text, highlight.occurrence || 0)
  if (!hit) return false
  const [start, end] = hit
  // Walk backwards: splitting a later node never moves an earlier node's offsets.
  for (let i = nodes.length - 1; i >= 0; i--) {
    const from = Math.max(start, starts[i])
    const to = Math.min(end, starts[i] + nodes[i].data.length)
    if (from >= to) continue
    let target = nodes[i]
    if (to - starts[i] < target.data.length) target.splitText(to - starts[i])
    if (from - starts[i] > 0) target = target.splitText(from - starts[i])
    const mark = document.createElement('mark')
    mark.className = MARK_CLASS
    mark.dataset.meHl = key
    target.parentNode!.insertBefore(mark, target)
    mark.appendChild(target)
  }
  return true
}

// Bring the page in line with `current`: drop marks for deleted highlights,
// add any that are missing. Our own DOM writes are discarded from the observer.
const paint = (article: Element) => {
  removeMarks(new Set(current.map(keyOf)))
  if (current.length) ensureCSS()
  for (const highlight of current) {
    const byId = /^[0-9a-f]{4}$/.test(highlight.paragraphId || '') ? article.querySelector(`[id="${highlight.paragraphId}"]`) : null
    if (byId && markInBlock(byId, highlight)) continue
    for (const block of Array.from(article.querySelectorAll(BLOCKS))) if (markInBlock(block, highlight)) break
  }
  observer?.takeRecords()
}

// Medium hydrates and re-renders paragraphs after load, which drops our marks.
// Watch the article only while this story has highlights, and repaint locally
// (no message to the background) shortly after it settles.
const watch = (article: Element) => {
  if (observer) return
  observer = new MutationObserver(() => {
    window.clearTimeout(repaintTimer)
    repaintTimer = window.setTimeout(() => { if (enabled && article.isConnected && current.length) paint(article) }, 300)
  })
  observer.observe(article, { childList: true, subtree: true, characterData: true })
}

const stopWatching = () => {
  observer?.disconnect()
  observer = null
  window.clearTimeout(repaintTimer)
}

export const clearInPageHighlights = () => {
  generation++
  current = []
  stopWatching()
  removeMarks()
}

// Fetch this story's highlights and paint them. Also called when the tab comes
// back into view, so deletions made on the Bookshelf page show up here.
export const applyInPageHighlights = async () => {
  const article = quoteStoryRoot()
  if (!enabled || !article) return
  const run = generation
  let highlights: PageHighlight[] = []
  try { highlights = (await bookshelfRequest<{ highlights: PageHighlight[] }>({ action: 'pageHighlights' })).highlights || [] }
  catch { return } // not a saved story, or the extension was reloaded: leave the page alone
  if (run !== generation || !article.isConnected) return
  current = highlights
  if (!current.length) { stopWatching(); removeMarks(); return }
  paint(article)
  watch(article)
}

export const setInPageHighlightsEnabled = (on: boolean) => {
  enabled = on
  clearInPageHighlights()
  if (on) void applyInPageHighlights()
}
