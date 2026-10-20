import { isPro } from '../../shared/pro'
import { normalizeQuote, QUOTE_SIZES, QUOTE_TEMPLATES, renderQuoteCard, type QuoteCard, type QuoteSize, type QuoteTemplate } from '../../shared/quote-card'
import { readQuoteCard } from '../lib/quote-card'
import { showToast } from '../util/toast'
import { createQuoteHover } from './quote-hover'

const PANEL_ID = '__me_quote_card_panel__'
export const QUOTE_PANEL_LEAVE_MS = 600
const BUTTON_ID = '__me_quote_card_button__'
const TOOLBAR_ID = '__me_selection_toolbar__'
const HIGHLIGHT_ID = '__me_selection_highlight__'
const CSS = `
#${PANEL_ID} {
  position: fixed; top: 80px; right: 24px; width: 520px; max-width: calc(100vw - 32px);
  max-height: calc(100vh - 104px); display: flex; flex-direction: column; overflow: hidden;
  background: #fff; color: #111; border: 1px solid #e0e0e0; border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.18); z-index: 2147483647;
  font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
#${PANEL_ID} * { box-sizing: border-box; }
#${PANEL_ID} .me-qc-header {
  display: flex; align-items: center; justify-content: space-between; padding: 10px 12px;
  background: #02b875; color: #fff; font-weight: 600;
}
#${PANEL_ID} .me-qc-body { padding: 12px; overflow-y: auto; }
#${PANEL_ID} .me-qc-choices, #${PANEL_ID} .me-qc-actions { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 12px; }
#${PANEL_ID} button {
  font: inherit; font-size: 12px; padding: 5px 9px; border: 1px solid #d6d6d6;
  border-radius: 5px; color: #222; background: #fff; cursor: pointer;
}
#${PANEL_ID} button[aria-pressed="true"] { border-color: #1a8917; color: #1a8917; background: #edf7ed; }
#${PANEL_ID} button:disabled { opacity: 0.5; cursor: default; }
#${PANEL_ID} .me-qc-close { border: 0; background: rgba(255,255,255,0.2); color: #fff; }
#${PANEL_ID} .me-qc-badge { font-size: 10px; border-radius: 3px; padding: 1px 3px; background: #eee; margin-left: 4px; }
#${PANEL_ID} canvas { display: block; width: 100%; height: auto; border-radius: 5px; margin-bottom: 8px; }
#${PANEL_ID} .me-qc-note { font-size: 11px; color: #666; margin: 6px 0; overflow-wrap: anywhere; }
#${PANEL_ID} label { display: block; font: inherit; }
#${PANEL_ID} input { width: 100%; background: #fafafa; color: #222; border: 1px solid #ddd; border-radius: 4px; padding: 6px; font: inherit; }
#${TOOLBAR_ID}[hidden], #${TOOLBAR_ID} [hidden] { display: none; }
#${TOOLBAR_ID} {
  position: fixed; display: flex; align-items: center; gap: 2px; padding: 3px; border-radius: 16px;
  background: #1a8917; color: #fff; box-shadow: 0 3px 12px rgba(0,0,0,0.2); z-index: 2147483646;
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; white-space: nowrap;
}
#${TOOLBAR_ID} .me-tb-logo { font-weight: 700; font-size: 10px; letter-spacing: .5px; padding: 0 6px 0 7px; opacity: .85; }
#${TOOLBAR_ID} button {
  padding: 3px 10px; border: 0; border-radius: 13px; background: transparent; color: #fff; cursor: pointer; font: inherit;
}
#${TOOLBAR_ID} button:hover, #${TOOLBAR_ID} button:focus-visible { background: rgba(255,255,255,0.22); outline: none; }
`

let panel: HTMLDivElement | null = null
let panelCleanup: (() => void) | null = null
let button: HTMLButtonElement | null = null // the toolbar's Card button
let toolbar: HTMLDivElement | null = null
let highlightButton: HTMLButtonElement | null = null
type HighlightMode = 'add' | 'remove' | 'pro' | 'off'
type SelectionHighlighter = { modeFor: (range: Range) => HighlightMode; run: (mode: HighlightMode, range: Range, text: string) => Promise<void> }
let highlighter: SelectionHighlighter | null = null
let toolbarMode: HighlightMode = 'off'
// Wired by the content script entry so this module stays independent of Bookshelf.
export const setSelectionHighlighter = (value: SelectionHighlighter | null) => { highlighter = value }
let selectedCard: QuoteCard | null = null
let selectedUrl = ''
let contextCard: { card: QuoteCard; url: string } | null = null
let requestVersion = 0
let mounted = false
let selectionFrame = 0
let panelOpening = false
const hover = createQuoteHover(card => { void showQuoteCardPanel(card) }, () => !!panel || panelOpening)
export const setQuoteCardHoverEnabled = (enabled: boolean) => hover.setEnabled(enabled)

const ensureCSS = () => {
  if (document.getElementById(`${PANEL_ID}__style`)) return
  const style = document.createElement('style')
  style.id = `${PANEL_ID}__style`
  style.textContent = CSS
  document.documentElement.appendChild(style)
}

const closePanel = () => {
  requestVersion++
  panelOpening = false
  const cleanup = panelCleanup
  panelCleanup = null
  panel?.remove()
  panel = null
  cleanup?.()
}

const pngBlob = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Could not create PNG.')), 'image/png')
})

export const showQuoteCardPanel = async (card: QuoteCard) => {
  closePanel()
  panelOpening = true
  hover.hide()
  const version = requestVersion
  const url = window.location.href
  let pro = false
  try { pro = await isPro() } catch { /* free mode if storage is unavailable */ }
  if (version !== requestVersion || window.location.href !== url) return
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  ensureCSS()
  const root = document.createElement('div')
  root.id = PANEL_ID
  root.setAttribute('role', 'dialog')
  root.setAttribute('aria-modal', 'true')
  root.tabIndex = -1
  root.setAttribute('aria-label', 'Make quote card')
  const header = document.createElement('div')
  header.className = 'me-qc-header'
  const title = document.createElement('span')
  title.textContent = 'Make quote card'
  const close = document.createElement('button')
  close.className = 'me-qc-close'
  close.textContent = '×'
  close.setAttribute('aria-label', 'Close')
  close.onclick = () => { closePanel(); onSelectionChange() }
  header.append(title, close)
  const body = document.createElement('div')
  body.className = 'me-qc-body'
  const canvas = document.createElement('canvas')
  canvas.setAttribute('aria-label', `Quote by ${card.author}: ${card.quote}`)
  const note = document.createElement('div')
  note.className = 'me-qc-note'
  const attribution = document.createElement('div')
  attribution.className = 'me-qc-note'
  attribution.textContent = [card.author, card.title, card.publication, 'medium.com'].filter(Boolean).join(' · ')
  const status = document.createElement('div')
  status.className = 'me-qc-note'
  status.setAttribute('role', 'status')
  const linkLabel = document.createElement('label')
  linkLabel.textContent = 'Paragraph link — paste alongside the image'
  const link = document.createElement('input')
  link.type = 'text'
  link.readOnly = true
  link.value = card.link
  link.onclick = () => link.select()
  linkLabel.appendChild(link)
  let template: QuoteTemplate = 'classic'
  let size: QuoteSize = 'landscape'
  const choiceButtons: { button: HTMLButtonElement; pro: boolean; selected: () => boolean }[] = []
  const draw = () => {
    if (!pro) { template = 'classic'; size = 'landscape' }
    const rendered = renderQuoteCard(canvas, card, template, size, pro)
    note.textContent = rendered.truncated ? 'Quote truncated to fit the card (up to 600 characters).' : ''
    for (const choice of choiceButtons) {
      choice.button.disabled = choice.pro && !pro
      choice.button.setAttribute('aria-pressed', String(choice.selected()))
    }
  }
  const choices = <T extends string>(labelText: string, items: readonly { id: T; label: string; pro: boolean }[], get: () => T, set: (value: T) => void) => {
    const label = document.createElement('div')
    label.textContent = labelText
    const group = document.createElement('div')
    group.className = 'me-qc-choices'
    group.setAttribute('role', 'group')
    group.setAttribute('aria-label', labelText)
    for (const item of items) {
      const choice = document.createElement('button')
      choice.textContent = item.label
      if (item.pro) {
        const badge = document.createElement('span')
        badge.className = 'me-qc-badge'
        badge.textContent = 'Pro'
        choice.appendChild(badge)
      }
      choice.onclick = () => { set(item.id); draw() }
      choiceButtons.push({ button: choice, pro: item.pro, selected: () => get() === item.id })
      group.appendChild(choice)
    }
    body.append(label, group)
  }
  choices('Style', QUOTE_TEMPLATES, () => template, value => { template = value })
  choices('Size', QUOTE_SIZES, () => size, value => { size = value })
  body.append(canvas, note, attribution)
  const actions = document.createElement('div')
  actions.className = 'me-qc-actions'
  // Auto-close bookkeeping: never close mid-download/copy (see pointerleave below).
  let busy = 0
  let pointerInside = false
  let leaveDeferred = false // a pointer-leave close that an action postponed
  let afterBusy: (() => void) | null = null
  const action = (label: string, run: () => Promise<void>) => {
    const btn = document.createElement('button')
    btn.textContent = label
    btn.onclick = async () => {
      btn.disabled = true
      busy++
      try { await run() } catch (error) {
        status.textContent = (error as Error).message || 'Action failed.'
        showToast(status.textContent)
      } finally {
        btn.disabled = false
        busy--
        if (!busy) afterBusy?.()
      }
    }
    actions.appendChild(btn)
  }
  const prepareImage = async () => {
    pro = await isPro().catch(() => false)
    draw()
  }
  const download = async () => {
    const result = await chrome.runtime.sendMessage({ type: 'downloadQuoteCard', title: card.title, dataUrl: canvas.toDataURL('image/png') })
    if (!result?.ok) throw new Error(result?.error || 'Download failed.')
    status.textContent = 'Saved PNG to your Downloads folder.'
    showToast(status.textContent)
  }
  action('Download PNG', async () => { await prepareImage(); await download() })
  action('Copy image', async () => {
    await prepareImage()
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await pngBlob(canvas) })])
      status.textContent = 'Image copied. The paragraph link below is ready to copy alongside it.'
      showToast('Image copied. Copy the paragraph link below to paste alongside it.')
      linkLabel.scrollIntoView({ block: 'nearest' })
    } catch {
      showToast('Copy image failed. Downloading PNG instead.')
      await download()
      status.textContent = 'Copy image failed; PNG downloaded. The paragraph link below is ready to copy.'
    }
  })
  action('Copy paragraph link', async () => {
    try {
      await navigator.clipboard.writeText(card.link)
      status.textContent = 'Paragraph link copied.'
      showToast(status.textContent)
    } catch {
      link.focus()
      link.select()
      throw new Error('Copy failed. Copy the selected paragraph link manually.')
    }
  })
  body.append(actions, linkLabel, status)
  root.append(header, body)
  draw()
  document.body.appendChild(root)
  panel = root
  panelOpening = false
  const refreshPro = async () => {
    const active = await isPro().catch(() => false)
    if (panel === root && pro !== active) { pro = active; draw() }
  }
  const onProChanged = (changes, area) => {
    if ((area === 'local' || area === 'sync') && (changes.enhancerProUnlocked || changes.enhancerProKey)) void refreshPro()
  }
  window.addEventListener('focus', refreshPro)
  chrome.storage.onChanged.addListener(onProChanged)
  const expiryCheck = window.setInterval(refreshPro, 60000)
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      closePanel()
      onSelectionChange()
    } else if (event.key === 'Tab') {
      const controls = Array.from(root.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], [tabindex="0"]'))
      const first = controls[0]
      const last = controls.at(-1)
      if (!controls.includes(document.activeElement as HTMLElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first)?.focus()
      }
    }
  }
  document.addEventListener('keydown', onKeyDown, true)
  // Close when the pointer leaves the panel (after a short grace period, so a
  // cursor that grazes the edge on its way to a button doesn't lose the panel),
  // or on a click anywhere outside it. Never while an action is running or the
  // link field has focus. A panel the pointer never entered stays open.
  let leaveTimer = 0
  const cancelLeave = () => { window.clearTimeout(leaveTimer); leaveTimer = 0 }
  const closeFromPointer = () => {
    if (panel !== root) return
    if (busy) { leaveDeferred = true; return }
    if (document.activeElement instanceof HTMLInputElement && root.contains(document.activeElement)) return
    closePanel()
    onSelectionChange()
  }
  const onPointerLeave = () => {
    pointerInside = false
    cancelLeave()
    leaveTimer = window.setTimeout(closeFromPointer, QUOTE_PANEL_LEAVE_MS)
  }
  const onPointerEnter = () => { pointerInside = true; leaveDeferred = false; cancelLeave() }
  // Keyboard-only use never schedules a close: only resume one the pointer started.
  afterBusy = () => { if (leaveDeferred && !pointerInside) { leaveDeferred = false; onPointerLeave() } }
  const onPointerDownOutside = (event: PointerEvent) => {
    if (panel === root && !root.contains(event.target as Node)) closeFromPointer()
  }
  root.addEventListener('pointerleave', onPointerLeave)
  root.addEventListener('pointerenter', onPointerEnter)
  document.addEventListener('pointerdown', onPointerDownOutside, true)
  panelCleanup = () => {
    cancelLeave()
    afterBusy = null
    document.removeEventListener('pointerdown', onPointerDownOutside, true)
    window.removeEventListener('focus', refreshPro)
    chrome.storage.onChanged.removeListener(onProChanged)
    window.clearInterval(expiryCheck)
    document.removeEventListener('keydown', onKeyDown, true)
    if (previousFocus === button && toolbar) toolbar.hidden = false
    if (previousFocus?.isConnected) previousFocus.focus()
  }
  if (toolbar) toolbar.hidden = true
  root.focus()
}

const hideButton = () => { if (toolbar) toolbar.hidden = true }
const updateSelection = () => {
  selectionFrame = 0
  const selection = window.getSelection()
  selectedCard = selection && !selection.isCollapsed && selection.toString().trim() ? readQuoteCard() : null
  selectedUrl = window.location.href
  if (!selectedCard || !selection?.rangeCount) { hideButton(); return }
  ensureCSS()
  if (!toolbar) {
    toolbar = document.createElement('div')
    toolbar.id = TOOLBAR_ID
    toolbar.setAttribute('role', 'toolbar')
    toolbar.setAttribute('aria-label', 'Medium Enhancer')
    toolbar.onmousedown = e => e.preventDefault() // keep the selection
    const logo = document.createElement('span')
    logo.className = 'me-tb-logo'
    logo.textContent = 'ME'
    logo.title = 'Medium Enhancer'
    highlightButton = document.createElement('button')
    highlightButton.id = HIGHLIGHT_ID
    highlightButton.onclick = () => {
      const current = window.getSelection()
      if (!highlighter || !current?.rangeCount || current.isCollapsed) return
      const range = current.getRangeAt(0).cloneRange()
      void highlighter.run(toolbarMode, range, current.toString()).finally(onSelectionChange)
    }
    button = document.createElement('button')
    button.id = BUTTON_ID
    button.textContent = 'Card'
    button.title = 'Make a quote card from the selection'
    button.onclick = () => { if (selectedCard && selectedUrl === window.location.href) void showQuoteCardPanel(selectedCard) }
    toolbar.append(logo, highlightButton, button)
    document.body.appendChild(toolbar)
  }
  const range = selection.getRangeAt(0)
  toolbarMode = highlighter ? highlighter.modeFor(range) : 'off'
  highlightButton!.hidden = toolbarMode === 'off'
  highlightButton!.textContent = toolbarMode === 'remove' ? 'Remove highlight' : toolbarMode === 'pro' ? 'Highlight · Pro' : 'Highlight'
  highlightButton!.title = toolbarMode === 'remove' ? 'Remove this highlight from your Bookshelf'
    : toolbarMode === 'pro' ? 'Private highlights are part of Pro' : 'Highlight and save to your Bookshelf'
  toolbar.hidden = false
  const rect = range.getBoundingClientRect()
  const width = toolbar.offsetWidth || 160
  toolbar.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.right + 6))}px`
  toolbar.style.top = `${Math.max(8, Math.min(window.innerHeight - 36, rect.bottom + 6))}px`
}
const onSelectionChange = () => {
  if (window.getSelection()?.isCollapsed === false) hover.hide()
  if (!selectionFrame) selectionFrame = window.requestAnimationFrame(updateSelection)
}
const onContextMenu = (event: MouseEvent) => {
  const card = readQuoteCard(event.target as Node)
  contextCard = card ? { card, url: window.location.href } : null
}

export const openQuoteCardFromSelection = (selectionText = '') => {
  const card = contextCard?.url === window.location.href && (!selectionText.trim() || normalizeQuote(selectionText).text === contextCard.card.quote)
    ? contextCard.card : readQuoteCard()
  if (card) void showQuoteCardPanel(card)
  else showToast('Select text inside the Medium story body to make a quote card.')
}

export const mountQuoteCardButton = () => {
  if (mounted) return
  mounted = true
  document.addEventListener('selectionchange', onSelectionChange)
  document.addEventListener('contextmenu', onContextMenu, true)
  window.addEventListener('scroll', hideButton, true)
  window.addEventListener('resize', hideButton)
}

export const resetQuoteCard = () => {
  hover.reset()
  closePanel()
  hideButton()
  selectedCard = null
  selectedUrl = ''
  contextCard = null
  if (selectionFrame) window.cancelAnimationFrame(selectionFrame)
  selectionFrame = 0
}
