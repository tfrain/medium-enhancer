// Floating action button that opens the AI action menu on click.
// Mounted unconditionally on all pages when aiSummaryEnabled is true.

import { hideAiMenu, isAiMenuOpen, showAiMenu } from './ai-menu'

const BALL_ID = '__me_summary_ball__'
const BALL_POS_KEY = 'summaryBallPos' // { bottom, right } in px

const BALL_CSS = `
#${BALL_ID} {
  position: fixed;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: linear-gradient(135deg, #02b875 0%, #029e66 100%);
  color: #ffffff;
  font-weight: 700;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-shadow: 0 4px 14px rgba(0,0,0,0.25);
  cursor: pointer;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
#${BALL_ID}:hover {
  transform: scale(1.08);
  box-shadow: 0 6px 18px rgba(0,0,0,0.32);
}
#${BALL_ID}.dragging { transition: none; cursor: grabbing; }
#${BALL_ID} .me-ball-close {
  position: absolute;
  top: -4px;
  right: -4px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #333;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  display: none;
}
#${BALL_ID}:hover .me-ball-close { display: block; }
`

let ballEl: HTMLDivElement | null = null

const ensureStyle = () => {
  if (document.getElementById(`${BALL_ID}__style`)) return
  const style = document.createElement('style')
  style.id = `${BALL_ID}__style`
  style.textContent = BALL_CSS
  document.documentElement.appendChild(style)
}

const toggleMenu = () => {
  if (!ballEl) return
  if (isAiMenuOpen()) {
    hideAiMenu()
    return
  }
  const rect = ballEl.getBoundingClientRect()
  showAiMenu({
    bottom: Math.max(8, window.innerHeight - rect.bottom),
    right: Math.max(8, window.innerWidth - rect.right),
  })
}

export const mountSummaryBall = () => {
  if (ballEl) return
  if (!document.body) {
    // Body not ready yet — retry shortly
    window.addEventListener('DOMContentLoaded', mountSummaryBall, { once: true })
    return
  }
  ensureStyle()
  const existing = document.getElementById(BALL_ID)
  if (existing) existing.remove()

  const el = document.createElement('div')
  el.id = BALL_ID
  el.textContent = 'AI'
  el.title = 'Summarize this page with AI'

  const closeBtn = document.createElement('span')
  closeBtn.className = 'me-ball-close'
  closeBtn.textContent = '×'
  closeBtn.title = 'Hide for this session'
  el.appendChild(closeBtn)

  // Restore saved position or default to bottom-right
  chrome.storage.local.get({ [BALL_POS_KEY]: { bottom: 80, right: 24 } }, (items) => {
    const pos = items[BALL_POS_KEY]
    el.style.bottom = `${pos.bottom}px`
    el.style.right = `${pos.right}px`
  })

  document.body.appendChild(el)
  ballEl = el

  // Drag handling — distinguish click from drag
  let startX = 0, startY = 0
  let startBottom = 0, startRight = 0
  let moved = false
  let dragging = false

  el.addEventListener('mousedown', (e) => {
    if (e.target === closeBtn) return
    dragging = true
    moved = false
    startX = e.clientX
    startY = e.clientY
    const rect = el.getBoundingClientRect()
    startBottom = window.innerHeight - rect.bottom
    startRight = window.innerWidth - rect.right
    el.classList.add('dragging')
    e.preventDefault()
  })

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    if (!moved && Math.abs(dx) + Math.abs(dy) > 4) moved = true
    const nextBottom = Math.max(8, startBottom - dy)
    const nextRight = Math.max(8, startRight - dx)
    el.style.bottom = `${nextBottom}px`
    el.style.right = `${nextRight}px`
  })

  window.addEventListener('mouseup', () => {
    if (!dragging) return
    dragging = false
    el.classList.remove('dragging')
    if (moved) {
      const rect = el.getBoundingClientRect()
      const pos = {
        bottom: Math.max(8, window.innerHeight - rect.bottom),
        right: Math.max(8, window.innerWidth - rect.right),
      }
      chrome.storage.local.set({ [BALL_POS_KEY]: pos })
    }
  })

  el.addEventListener('click', (e) => {
    if (e.target === closeBtn) return
    if (moved) return // was a drag, not a click
    toggleMenu()
  })

  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    unmountSummaryBall()
  })
}

export const unmountSummaryBall = () => {
  if (ballEl) {
    ballEl.remove()
    ballEl = null
  }
}
