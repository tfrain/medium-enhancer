import { isQuoteHoverBlock, QUOTE_HOVER_BLOCKS, quoteHoverPosition } from '../../shared/quote-hover'
import type { QuoteCard } from '../../shared/quote-card'
import { quoteStoryRoot, readQuoteCard } from '../lib/quote-card'

export const createQuoteHover = (open: (card: QuoteCard) => void, panelOpen: () => boolean) => {
  let mounted = false
  let icon: HTMLButtonElement | null = null
  let paragraph: Element | null = null
  let paragraphUrl = ''
  let pointerTarget: Element | null = null
  let frame = 0
  let pointerChanged = false
  let hideTimer = 0

  const blocked = () => panelOpen() || window.getSelection()?.isCollapsed === false
  const cancelHide = () => { window.clearTimeout(hideTimer); hideTimer = 0 }
  const hide = () => {
    cancelHide()
    if (frame) window.cancelAnimationFrame(frame)
    frame = 0
    pointerChanged = false
    pointerTarget = null
    paragraph = null
    paragraphUrl = ''
    if (icon) icon.hidden = true
  }
  const position = () => {
    const article = quoteStoryRoot()
    if (blocked() || paragraphUrl !== window.location.href || !article || !paragraph?.isConnected || !isQuoteHoverBlock(paragraph, article)) {
      hide(); return
    }
    const point = quoteHoverPosition(paragraph.getBoundingClientRect(), { width: window.innerWidth, height: window.innerHeight })
    if (!point) { hide(); return }
    if (!icon) {
      icon = document.createElement('button')
      icon.id = '__me_quote_card_hover__'
      icon.type = 'button'
      icon.setAttribute('aria-label', 'Make a quote card from this paragraph')
      icon.title = 'Quote card'
      icon.textContent = '❝'
      icon.style.cssText = 'position:fixed;width:24px;height:24px;box-sizing:border-box;padding:0;border:0;border-radius:50%;background:#1a8917;color:#fff;box-shadow:0 2px 8px #0003;cursor:pointer;z-index:2147483646;font:18px/24px Georgia,serif;text-align:center;'
      icon.onmousedown = event => event.preventDefault()
      icon.onclick = () => {
        if (blocked() || paragraphUrl !== window.location.href || !paragraph) { hide(); return }
        const card = readQuoteCard(paragraph)
        hide()
        if (card) open(card)
      }
      document.body.appendChild(icon)
    }
    icon.style.left = `${point.left}px`
    icon.style.top = `${point.top}px`
    icon.hidden = false
  }
  const updatePointer = () => {
    if (blocked()) { hide(); return }
    const article = quoteStoryRoot()
    if (!article) { hide(); return }
    const block = pointerTarget?.closest(QUOTE_HOVER_BLOCKS)
    if (block && isQuoteHoverBlock(block, article)) {
      cancelHide()
      paragraph = block
      paragraphUrl = window.location.href
      position()
    } else if (icon && pointerTarget && icon.contains(pointerTarget) && !icon.hidden) {
      cancelHide()
      position()
    } else if (paragraph && !hideTimer) {
      hideTimer = window.setTimeout(hide, 300)
    }
  }
  const scheduleFrame = () => {
    if (frame) return
    frame = window.requestAnimationFrame(() => {
      frame = 0
      if (pointerChanged) {
        pointerChanged = false
        updatePointer()
      } else position()
    })
  }
  const onMouseOver = (event: MouseEvent) => {
    pointerTarget = event.target instanceof Element ? event.target : null
    // Cancel immediately, even if a pending hide would fire before the next frame.
    if (pointerTarget && (paragraph?.contains(pointerTarget) || icon?.contains(pointerTarget))) cancelHide()
    pointerChanged = true
    scheduleFrame()
  }
  const onMouseLeave = () => {
    pointerTarget = null
    pointerChanged = true
    scheduleFrame()
  }
  const reposition = () => {
    if (paragraph) scheduleFrame()
  }
  const reset = () => {
    hide()
    icon?.remove()
    icon = null
    document.removeEventListener('mouseover', onMouseOver)
    document.removeEventListener('mouseleave', onMouseLeave)
    window.removeEventListener('scroll', reposition, true)
    window.removeEventListener('resize', reposition)
    mounted = false
  }
  const setEnabled = (enabled: boolean) => {
    if (!enabled || !quoteStoryRoot()) { reset(); return }
    if (mounted) return
    mounted = true
    document.addEventListener('mouseover', onMouseOver, { passive: true })
    document.addEventListener('mouseleave', onMouseLeave, { passive: true })
    window.addEventListener('scroll', reposition, { capture: true, passive: true })
    window.addEventListener('resize', reposition, { passive: true })
  }
  return { setEnabled, reset, hide }
}
