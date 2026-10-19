import { QUOTE_NOISE_SELECTORS } from '../../shared/quote-hover'
import { buildParagraphLink, mediumPostId } from '../../shared/medium-url'
import { findParagraphId, normalizeQuote, type QuoteCard } from '../../shared/quote-card'

const textOf = (element: Element | null) => (element?.textContent || '').replace(/\s+/g, ' ').trim()
const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`)?.content?.trim() || ''

export const quoteStoryRoot = (): HTMLElement | null =>
  mediumPostId(window.location.href) ? document.querySelector('article') : null

const selectionElement = (node: Node | null): Element | null =>
  node?.nodeType === Node.ELEMENT_NODE ? node as Element : node?.parentElement || null

export const readQuoteCard = (fallbackNode?: Node | null): QuoteCard | null => {
  const article = quoteStoryRoot()
  const selection = window.getSelection()
  if (!article) return null
  const range = selection?.rangeCount ? selection.getRangeAt(0) : null
  const selected = !!range && !range.collapsed && !!selection?.toString().trim()
  const start = selectionElement(selected ? range.startContainer : fallbackNode || range?.startContainer || null)
  if (!start || !article.contains(start)) return null
  if (start.closest(QUOTE_NOISE_SELECTORS)) return null
  if (selected) {
    const end = selectionElement(range.endContainer)
    if (!end || !article.contains(end) || end.closest(QUOTE_NOISE_SELECTORS)) return null
    if (Array.from(article.querySelectorAll(QUOTE_NOISE_SELECTORS)).some(node => range.intersectsNode(node))) return null
  }
  const block = start.closest('p, li, blockquote, h2, h3, h4, pre, figcaption')
  if (!block || !article.contains(block)) return null
  const paragraphId = findParagraphId(start, article)
  const quote = normalizeQuote(selected ? selection!.toString() : textOf(block))
  if (!quote.text) return null
  const currentUrl = new URL(window.location.href)
  currentUrl.hash = ''
  currentUrl.search = ''
  const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || ''
  const canonicalUrl = mediumPostId(canonical) === mediumPostId(currentUrl.href) ? canonical : currentUrl.href
  const title = textOf(article.querySelector('h1')) || meta('og:title') || document.title || 'Untitled story'
  const author = meta('author') || textOf(article.querySelector('[data-testid="authorName"], .pw-author, a[rel="author"]')) || 'Unknown author'
  let publication = textOf(document.querySelector('[data-testid="publicationName"], [data-testid="storyPublicationName"], .pw-publication-name, a[href*="publication_info"], a[href*="publication_nav"]'))
  if (!publication) {
    const url = new URL(canonicalUrl)
    const part = url.pathname.split('/').filter(Boolean)[0]
    if (url.hostname === 'medium.com' && part && !part.startsWith('@') && part !== 'p') {
      // The publication link sits in the page header, outside <article> (live layout, 2026-10-19).
      publication = textOf(Array.from(document.querySelectorAll('a[href]')).find(link => {
        try { return !!textOf(link) && new URL((link as HTMLAnchorElement).href).pathname.replace(/\/$/, '') === `/${part}` } catch { return false }
      }) || null)
    }
  }
  const siteName = meta('og:site_name')
  if (!publication && siteName && siteName.toLowerCase() !== 'medium') publication = siteName
  return { quote: quote.text, truncated: quote.truncated, author, title, publication, link: buildParagraphLink(canonicalUrl, paragraphId) }
}
