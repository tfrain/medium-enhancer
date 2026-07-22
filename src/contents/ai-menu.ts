// Popover menu that appears when the user clicks the floating AI ball.
// Offers preset actions and a free-text custom prompt.

import { AI_PRESETS } from './ai-presets'
import { extractArticle, extractArticleTextForAI } from './lib/extract'
import { clipCurrentMediumArticleAsMarkdown } from './markdown/medium-to-markdown'
import { showAiPanel } from './summary-panel'
import { showToast } from './util/toast'

const MENU_ID = '__me_ai_menu__'

const MENU_CSS = `
#${MENU_ID} {
  position: fixed;
  width: 280px;
  background: #ffffff;
  color: #111111;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.22);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  z-index: 2147483647;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
#${MENU_ID} .me-menu-title {
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
  margin-bottom: 2px;
}
#${MENU_ID} .me-menu-preset {
  display: block;
  width: 100%;
  text-align: left;
  padding: 8px 10px;
  background: #f5f5f5;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #111;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s;
}
#${MENU_ID} .me-menu-preset:hover {
  background: #e6f7ee;
  border-color: #02b875;
}
#${MENU_ID} .me-menu-separator {
  height: 1px;
  background: #e0e0e0;
  margin: 4px 0;
}
#${MENU_ID} textarea {
  width: 100%;
  min-height: 60px;
  max-height: 140px;
  padding: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 6px;
  font-family: inherit;
  font-size: 12px;
  color: #111;
  background: #fafafa;
  resize: vertical;
  box-sizing: border-box;
  outline: none;
}
#${MENU_ID} textarea:focus {
  border-color: #02b875;
  background: #ffffff;
}
#${MENU_ID} .me-menu-run {
  padding: 7px 10px;
  background: #02b875;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
#${MENU_ID} .me-menu-run:hover { opacity: 0.92; }
#${MENU_ID} .me-menu-run:disabled { opacity: 0.5; cursor: not-allowed; }
@media (prefers-color-scheme: dark) {
  #${MENU_ID} {
    background: #1e1e1e;
    color: #f0f0f0;
    border-color: #3a3a3a;
  }
  #${MENU_ID} .me-menu-preset {
    background: #2a2a2a;
    color: #f0f0f0;
  }
  #${MENU_ID} .me-menu-preset:hover {
    background: #024d2d;
    border-color: #02b875;
  }
  #${MENU_ID} .me-menu-separator { background: #3a3a3a; }
  #${MENU_ID} textarea {
    background: #2a2a2a;
    color: #f0f0f0;
    border-color: #3a3a3a;
  }
  #${MENU_ID} textarea:focus { background: #1e1e1e; }
}
`

let menuEl: HTMLDivElement | null = null
let outsideHandler: ((e: MouseEvent) => void) | null = null
let escHandler: ((e: KeyboardEvent) => void) | null = null

const ensureStyle = () => {
  if (document.getElementById(`${MENU_ID}__style`)) return
  const style = document.createElement('style')
  style.id = `${MENU_ID}__style`
  style.textContent = MENU_CSS
  document.documentElement.appendChild(style)
}

export const hideAiMenu = () => {
  if (menuEl) {
    menuEl.remove()
    menuEl = null
  }
  if (outsideHandler) {
    document.removeEventListener('mousedown', outsideHandler, true)
    outsideHandler = null
  }
  if (escHandler) {
    document.removeEventListener('keydown', escHandler, true)
    escHandler = null
  }
}

const getSelectedCommentText = () => {
  const selection = window.getSelection()
  return selection ? selection.toString().trim() : ''
}

const runWithInstruction = (
  headline: string,
  instruction: string,
  options?: { requiresSelection?: boolean; pastedComment?: string; autoCopyPrimary?: boolean },
) => {
  hideAiMenu()
  let text = ''
  let title = document.title || ''
  let extraContext = ''
  try {
    const article = extractArticle()
    text = extractArticleTextForAI(article)
  } catch {}
  if (options?.requiresSelection) {
    extraContext = getSelectedCommentText()
    if (!extraContext) {
      showToast('Select the reader comment text first, then run this action.')
      return
    }
  }
  if (options?.pastedComment) {
    extraContext = options.pastedComment.trim()
    if (!extraContext) {
      showToast('Paste the reader comment first, then run this action.')
      return
    }
  }
  showAiPanel({
    headline,
    instruction,
    articleText: text,
    articleTitle: title,
    extraContext,
    autoCopyPrimary: options?.autoCopyPrimary,
  })
}

const getStorage = <T extends Record<string, any>>(defaults: T): Promise<T> =>
  new Promise((resolve) => {
    chrome.storage.local.get(defaults, (items) => resolve(items as T))
  })

const safePathValue = (value: string, fallback: string): string =>
  String(value || fallback)
    .replace(/[?<>\\:*|":]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || fallback

const formatPublishedDate = (published: string): string => {
  if (!published) return new Date().toISOString().slice(0, 10)
  const date = new Date(published)
  return Number.isNaN(date.getTime())
    ? published.slice(0, 10)
    : date.toISOString().slice(0, 10)
}

const renderObsidianPathTemplate = (
  template: string,
  clip: ReturnType<typeof clipCurrentMediumArticleAsMarkdown>,
): string => {
  const value = String(template || '').trim()
  if (!value) return ''

  const rendered = value
    .replace(/\{title\}/g, safePathValue(clip.title, 'Untitled'))
    .replace(/\{author\}/g, safePathValue(clip.author, 'Unknown Author'))
    .replace(/\{domain\}/g, safePathValue(clip.domain, 'medium.com'))
    .replace(/\{date\}/g, safePathValue(formatPublishedDate(clip.published), 'undated'))
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')

  return rendered.endsWith('.md') ? rendered : `${rendered}.md`
}

const sendCurrentArticleToObsidian = async () => {
  hideAiMenu()
  const settings = await getStorage({
    obsidianClipperEnabled: true,
    obsidianVault: '',
    obsidianFolder: 'clippers',
    obsidianPathTemplate: '',
  })

  if (!settings.obsidianClipperEnabled) {
    showToast('Enable Obsidian Clipper in extension options first.')
    return
  }

  try {
    const clip = clipCurrentMediumArticleAsMarkdown()
    const filepath = renderObsidianPathTemplate(settings.obsidianPathTemplate, clip)
    const response = await chrome.runtime.sendMessage({
      type: 'send-to-obsidian',
      markdown: clip.markdown,
      title: clip.title,
      vault: settings.obsidianVault,
      folder: settings.obsidianFolder,
      filepath,
    })

    if (!response?.ok) {
      throw new Error(response?.error || 'Failed to send article to Obsidian.')
    }

    showToast(`Sent to Obsidian: ${response.filepath}`)
  } catch (error: any) {
    showToast(error?.message || 'Failed to clip article to Obsidian.')
  }
}

export const isAiMenuOpen = () => menuEl !== null

export const showAiMenu = (anchor: { bottom: number; right: number }) => {
  if (menuEl) {
    hideAiMenu()
    return
  }
  ensureStyle()

  const el = document.createElement('div')
  el.id = MENU_ID
  // Place just above the ball
  el.style.bottom = `${anchor.bottom + 56}px`
  el.style.right = `${anchor.right}px`

  const titleEl = document.createElement('div')
  titleEl.className = 'me-menu-title'
  titleEl.textContent = 'AI Actions'
  el.appendChild(titleEl)

  for (const preset of AI_PRESETS) {
    const btn = document.createElement('button')
    btn.className = 'me-menu-preset'
    btn.type = 'button'
    btn.textContent = preset.label
    btn.addEventListener('click', () =>
      runWithInstruction(preset.label, preset.instruction, {
        requiresSelection: preset.requiresSelection,
      }),
    )
    el.appendChild(btn)
  }

  const obsidianSep = document.createElement('div')
  obsidianSep.className = 'me-menu-separator'
  el.appendChild(obsidianSep)

  const obsidianBtn = document.createElement('button')
  obsidianBtn.className = 'me-menu-preset'
  obsidianBtn.type = 'button'
  obsidianBtn.textContent = 'Clip to Obsidian'
  obsidianBtn.addEventListener('click', () => {
    sendCurrentArticleToObsidian()
  })
  el.appendChild(obsidianBtn)

  const sep = document.createElement('div')
  sep.className = 'me-menu-separator'
  el.appendChild(sep)

  const customTitle = document.createElement('div')
  customTitle.className = 'me-menu-title'
  customTitle.textContent = 'Custom Prompt'
  el.appendChild(customTitle)

  const textarea = document.createElement('textarea')
  textarea.placeholder = 'Ask anything about this article…'
  el.appendChild(textarea)

  const runBtn = document.createElement('button')
  runBtn.className = 'me-menu-run'
  runBtn.type = 'button'
  runBtn.textContent = 'Run'
  runBtn.disabled = true
  textarea.addEventListener('input', () => {
    runBtn.disabled = textarea.value.trim().length === 0
  })
  const runCustom = () => {
    const v = textarea.value.trim()
    if (!v) return
    runWithInstruction('Custom', v)
  }
  runBtn.addEventListener('click', runCustom)
  textarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      runCustom()
    }
  })
  el.appendChild(runBtn)

  const pastedSep = document.createElement('div')
  pastedSep.className = 'me-menu-separator'
  el.appendChild(pastedSep)

  const explainTitle = document.createElement('div')
  explainTitle.className = 'me-menu-title'
  explainTitle.textContent = 'Understand Pasted Comment'
  el.appendChild(explainTitle)

  const commentTextarea = document.createElement('textarea')
  commentTextarea.placeholder = 'Paste the reader comment here…'
  commentTextarea.style.minHeight = '80px'
  el.appendChild(commentTextarea)

  const explainBtn = document.createElement('button')
  explainBtn.className = 'me-menu-run'
  explainBtn.type = 'button'
  explainBtn.textContent = 'Explain Comment'
  explainBtn.disabled = true
  commentTextarea.addEventListener('input', () => {
    explainBtn.disabled = commentTextarea.value.trim().length === 0
  })
  const runExplainFromPaste = () => {
    const pasted = commentTextarea.value.trim()
    if (!pasted) return
    const preset = AI_PRESETS.find((p) => p.id === 'explain-pasted-comment')
    if (!preset) return
    runWithInstruction(preset.label, preset.instruction, {
      pastedComment: pasted,
    })
  }
  explainBtn.addEventListener('click', runExplainFromPaste)
  commentTextarea.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault()
      runExplainFromPaste()
    }
  })
  el.appendChild(explainBtn)

  document.body.appendChild(el)
  menuEl = el

  // Focus the textarea so users can type immediately
  setTimeout(() => textarea.focus(), 0)

  // Close when clicking outside (but not on the ball itself — the ball's own
  // click handler will toggle)
  outsideHandler = (e: MouseEvent) => {
    if (!menuEl) return
    const target = e.target as Node
    if (menuEl.contains(target)) return
    const ball = document.getElementById('__me_summary_ball__')
    if (ball && ball.contains(target)) return
    hideAiMenu()
  }
  document.addEventListener('mousedown', outsideHandler, true)

  escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') hideAiMenu()
  }
  document.addEventListener('keydown', escHandler, true)
}
