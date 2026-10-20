import { bookshelfRequest } from '../../shared/bookshelf-client'
import { locateText } from '../../shared/highlight-locate'
import { quoteStoryRoot } from './quote-card'

type PageHighlight = { id?: number; text: string; paragraphId?: string; note?: string }

const MARK_CLASS = 'me-shelf-hl'
const STYLE_ID = '__me_shelf_hl_style__'
const BLOCKS = 'p, li, blockquote, h2, h3, h4, figcaption'
let enabled = false
let generation = 0
let timers: number[] = []

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

// Wrap one saved highlight inside one block. Returns false when the text is not
// in this block, so the caller can try the next one. Safe to call repeatedly.
export const markInBlock = (block: Element, highlight: PageHighlight): boolean => {
  const key = String(highlight.id ?? highlight.text)
  if (Array.from(block.querySelectorAll(`mark.${MARK_CLASS}`)).some(m => (m as HTMLElement).dataset.meHl === key)) return true
  const nodes = textNodes(block)
  const starts: number[] = []
  let full = ''
  for (const node of nodes) { starts.push(full.length); full += node.data }
  const hit = locateText(full, highlight.text)
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
    if (highlight.note) mark.title = highlight.note
    target.parentNode!.insertBefore(mark, target)
    mark.appendChild(target)
  }
  return true
}

export const clearInPageHighlights = () => {
  generation++
  timers.forEach(id => window.clearTimeout(id))
  timers = []
  document.querySelectorAll(`mark.${MARK_CLASS}`).forEach(mark => {
    const parent = mark.parentNode
    if (!parent) return
    while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
    parent.removeChild(mark)
    parent.normalize()
  })
}

export const applyInPageHighlights = async () => {
  const article = quoteStoryRoot()
  if (!enabled || !article) return
  const run = generation
  let highlights: PageHighlight[] = []
  try { highlights = (await bookshelfRequest<{ highlights: PageHighlight[] }>({ action: 'pageHighlights' })).highlights || [] }
  catch { return } // not a saved story, or Bookshelf unavailable: leave the page alone
  if (run !== generation || !highlights.length || !article.isConnected) return
  ensureCSS()
  for (const highlight of highlights) {
    const byId = /^[0-9a-f]{4}$/.test(highlight.paragraphId || '') ? article.querySelector(`[id="${highlight.paragraphId}"]`) : null
    if (byId && markInBlock(byId, highlight)) continue
    for (const block of Array.from(article.querySelectorAll(BLOCKS))) if (markInBlock(block, highlight)) break
  }
}

// Medium hydrates and sometimes re-renders the article after load, which drops
// our marks; re-applying a few times is cheap because markInBlock is idempotent.
export const setInPageHighlightsEnabled = (on: boolean) => {
  enabled = on
  clearInPageHighlights()
  if (!on || !quoteStoryRoot()) return
  const run = () => { void applyInPageHighlights() }
  run()
  timers.push(window.setTimeout(run, 1500), window.setTimeout(run, 4000))
}
