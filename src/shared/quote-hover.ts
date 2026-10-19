import { AI_NOISE_SELECTORS } from './article-noise'

export const QUOTE_NOISE_SELECTORS = AI_NOISE_SELECTORS + ', [contenteditable="true"], [data-testid*="editor" i], [aria-label*="editor" i], [class*="editor" i], [id*="editor" i]'
export const QUOTE_HOVER_BLOCKS = 'p, li, blockquote, h2, h3, h4'

export const isQuoteHoverBlock = (element: Element, article: Element): boolean =>
  article.contains(element) && element.matches(QUOTE_HOVER_BLOCKS) &&
  (element.hasAttribute('id') || element.hasAttribute('data-selectable-paragraph')) &&
  !element.closest(`${QUOTE_NOISE_SELECTORS}, pre, figcaption`) &&
  !!element.textContent?.trim()

export const quoteHoverPosition = (
  rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>,
  viewport: { width: number; height: number },
): { left: number; top: number } | null => {
  if (rect.bottom <= 0 || rect.top >= viewport.height || rect.right <= 0 ||
    rect.left >= viewport.width || rect.right <= rect.left || rect.bottom <= rect.top) return null
  return rect.left >= 36
    ? { left: rect.left - 32, top: rect.top + 2 }
    : { left: rect.right - 28, top: Math.max(4, rect.top - 26) }
}
