import { getAiConfig, readAiSettings } from "../../shared/ai-defaults"

// In-page floating panel that streams an AI response from the background worker.
// Used for the summary, comment explanations, and any custom user prompt.
//
// The AI response fills the main column. If the user picked a translation
// language in Options (off by default), a second column is added and filled by
// a second request once the main response completes, asking the model to
// translate the accumulated text.

const PANEL_ID = '__me_summary_panel__'

const PANEL_CSS = `
#${PANEL_ID} {
  position: fixed;
  top: 80px;
  right: 24px;
  width: 640px;
  max-height: 72vh;
  background: #ffffff;
  color: #111111;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.18);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.55;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
#${PANEL_ID} .me-sum-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: #02b875;
  color: #ffffff;
  font-weight: 600;
  font-size: 13px;
  cursor: move;
  user-select: none;
}
#${PANEL_ID} .me-sum-header-actions { display: flex; gap: 6px; }
#${PANEL_ID} .me-sum-btn {
  background: rgba(255,255,255,0.2);
  border: none;
  color: #ffffff;
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
#${PANEL_ID} .me-sum-btn:hover { background: rgba(255,255,255,0.35); }
#${PANEL_ID} .me-sum-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
#${PANEL_ID} .me-sum-col {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
#${PANEL_ID} .me-sum-col + .me-sum-col {
  border-left: 1px solid #e0e0e0;
}
#${PANEL_ID} .me-sum-col-label {
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 600;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: #fafafa;
  border-bottom: 1px solid #e0e0e0;
}
#${PANEL_ID} .me-sum-col-content {
  padding: 12px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  flex: 1;
}
#${PANEL_ID} .me-sum-col-content.me-sum-pending {
  color: #aaa;
  font-style: italic;
}
#${PANEL_ID} .me-sum-status {
  padding: 6px 12px;
  background: #f7f7f7;
  border-top: 1px solid #e0e0e0;
  font-size: 11px;
  color: #666;
}
#${PANEL_ID} .me-sum-error {
  color: #c62828;
}
@media (prefers-color-scheme: dark) {
  #${PANEL_ID} {
    background: #1e1e1e;
    color: #f0f0f0;
    border-color: #3a3a3a;
  }
  #${PANEL_ID} .me-sum-col + .me-sum-col { border-left-color: #3a3a3a; }
  #${PANEL_ID} .me-sum-col-label {
    background: #252525;
    border-bottom-color: #3a3a3a;
    color: #aaa;
  }
  #${PANEL_ID} .me-sum-status {
    background: #2a2a2a;
    border-top-color: #3a3a3a;
    color: #aaa;
  }
}
`

type PanelRefs = {
  root: HTMLDivElement
  bodyEn: HTMLDivElement
  bodyTranslation: HTMLDivElement | null  // null when translation is disabled
  status: HTMLDivElement
  regenerateBtn: HTMLButtonElement
  cleanup: () => void
}

let current: PanelRefs | null = null
const activePorts = new Map<chrome.runtime.Port, () => void>()
let requestVersion = 0

const ensureStyle = () => {
  if (document.getElementById(`${PANEL_ID}__style`)) return
  const style = document.createElement('style')
  style.id = `${PANEL_ID}__style`
  style.textContent = PANEL_CSS
  document.documentElement.appendChild(style)
}

const disconnectPorts = () => {
  for (const cancel of [...activePorts.values()]) cancel()
}

export const disposePanel = () => {
  requestVersion++
  disconnectPorts()
  if (current) {
    current.cleanup()
    current.root.remove()
    current = null
  }
}

// Human-friendly label for the translation column header.
// Maps known values to native names; falls back to the raw string.
const TRANSLATION_LABELS: Record<string, string> = {
  'Simplified Chinese': '简体中文',
  'Traditional Chinese': '繁體中文',
  'Japanese': '日本語',
  'Korean': '한국어',
  'Spanish': 'Español',
  'French': 'Français',
  'German': 'Deutsch',
  'English': 'English',
}

const labelForLanguage = (lang: string) => TRANSLATION_LABELS[lang] ?? lang

const buildPanel = (headline: string, translationLanguage: string): PanelRefs => {
  ensureStyle()
  const existing = document.getElementById(PANEL_ID)
  if (existing) existing.remove()

  const root = document.createElement('div')
  root.id = PANEL_ID

  const header = document.createElement('div')
  header.className = 'me-sum-header'
  const title = document.createElement('span')
  title.textContent = headline
  const actions = document.createElement('div')
  actions.className = 'me-sum-header-actions'

  const copyBtn = document.createElement('button')
  copyBtn.className = 'me-sum-btn'
  copyBtn.textContent = 'Copy'

  const regenerateBtn = document.createElement('button')
  regenerateBtn.className = 'me-sum-btn'
  regenerateBtn.textContent = 'Regenerate'
  regenerateBtn.title = 'Generate another answer with the same article and comment'

  const closeBtn = document.createElement('button')
  closeBtn.className = 'me-sum-btn'
  closeBtn.textContent = '×'
  closeBtn.title = 'Close'

  actions.appendChild(regenerateBtn)
  actions.appendChild(copyBtn)
  actions.appendChild(closeBtn)
  header.appendChild(title)
  header.appendChild(actions)

  const body = document.createElement('div')
  body.className = 'me-sum-body'

  const makeCol = (labelText: string, pendingText: string) => {
    const col = document.createElement('div')
    col.className = 'me-sum-col'
    const label = document.createElement('div')
    label.className = 'me-sum-col-label'
    label.textContent = labelText
    const content = document.createElement('div')
    content.className = 'me-sum-col-content me-sum-pending'
    content.textContent = pendingText
    col.appendChild(label)
    col.appendChild(content)
    return { col, content }
  }

  const en = makeCol('English', 'Waiting for response…')
  body.appendChild(en.col)

  let translation: { col: HTMLDivElement; content: HTMLDivElement } | null = null
  if (translationLanguage) {
    translation = makeCol(labelForLanguage(translationLanguage), 'Waiting for the English result before translating...')
    body.appendChild(translation.col)
  } else {
    // Single-column layout — let English fill the width.
    root.style.width = '420px'
  }

  const status = document.createElement('div')
  status.className = 'me-sum-status'
  status.textContent = 'Extracting article…'

  root.appendChild(header)
  root.appendChild(body)
  root.appendChild(status)
  document.body.appendChild(root)

  copyBtn.addEventListener('click', () => {
    const enText = en.content.classList.contains('me-sum-pending') ? '' : en.content.innerText
    const trText = translation && !translation.content.classList.contains('me-sum-pending')
      ? translation.content.innerText
      : ''
    const combined = [enText, trText].filter(Boolean).join('\n\n---\n\n')
    navigator.clipboard.writeText(combined).then(() => {
      copyBtn.textContent = 'Copied'
      setTimeout(() => (copyBtn.textContent = 'Copy'), 1200)
    })
  })
  closeBtn.addEventListener('click', disposePanel)

  // simple drag
  let dragging = false
  let startX = 0, startY = 0, startTop = 0, startRight = 0
  header.addEventListener('mousedown', (e) => {
    dragging = true
    startX = e.clientX
    startY = e.clientY
    const rect = root.getBoundingClientRect()
    startTop = rect.top
    startRight = window.innerWidth - rect.right
    e.preventDefault()
  })
  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return
    const dx = e.clientX - startX
    const dy = e.clientY - startY
    root.style.top = `${Math.max(0, startTop + dy)}px`
    root.style.right = `${Math.max(0, startRight - dx)}px`
  }
  const onMouseUp = () => { dragging = false }
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)

  return {
    root,
    bodyEn: en.content,
    bodyTranslation: translation ? translation.content : null,
    status,
    regenerateBtn,
    cleanup: () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    },
  }
}

export type AiPanelRequest = {
  headline: string        // shown in the panel header
  instruction: string     // the prompt / system instruction
  articleText: string
  articleTitle: string
  extraContext?: string
}

type AiProviderConfig = {
  baseUrl: string
  model: string
  provider: 'ollama' | 'openai' | 'anthropic'
  apiKey?: string
}

// Stream one AI request into a target content div — Ollama (local, default) or
// a cloud provider (BYOK, no local install needed). Returns a promise that
// resolves with the accumulated text on success, or rejects with the error.
const streamInto = (
  target: HTMLDivElement,
  cfg: AiProviderConfig,
  payload: { instruction: string; title: string; text: string; context?: string },
  onStatus: (msg: string, isError?: boolean) => void,
  isCurrent: () => boolean,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    let accumulated = ''
    let started = false
    let settled = false
    const port = chrome.runtime.connect({ name: 'summarize' })
    const cleanup = () => {
      activePorts.delete(port)
      port.onMessage.removeListener(onMessage)
      port.onDisconnect.removeListener(onDisconnect)
    }
    const onMessage = (msg) => {
      if (settled || !isCurrent()) return
      if (msg.type === 'chunk') {
        if (!started) {
          started = true
          target.classList.remove('me-sum-pending')
          target.textContent = ''
        }
        onStatus('Streaming…')
        accumulated += msg.chunk
        target.textContent = accumulated
        target.scrollTop = target.scrollHeight
      } else if (msg.type === 'done') {
        settled = true
        cleanup()
        resolve(accumulated)
      } else if (msg.type === 'error') {
        settled = true
        cleanup()
        onStatus('Error: ' + (msg.error || 'unknown'), true)
        reject(new Error(msg.error || 'unknown'))
      }
    }
    const onDisconnect = () => {
      const error = chrome.runtime.lastError?.message || 'AI connection disconnected before completing. Try again.'
      cleanup()
      if (!settled) {
        settled = true
        if (isCurrent()) onStatus('Error: ' + error, true)
        reject(new Error(error))
      }
    }
    activePorts.set(port, () => {
      settled = true
      cleanup()
      reject(new Error('cancelled'))
      try { port.disconnect() } catch {}
    })
    port.onMessage.addListener(onMessage)
    port.onDisconnect.addListener(onDisconnect)
    try {
      port.postMessage({
        instruction: payload.instruction,
        title: payload.title,
        text: payload.text,
        context: payload.context,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        provider: cfg.provider,
      })
    } catch (error) {
      settled = true
      cleanup()
      try { port.disconnect() } catch {}
      reject(error)
    }
  })
}

const buildTranslateInstruction = (targetLanguage: string) =>
  `Translate the following text into ${targetLanguage}. ` +
  'Preserve the original structure, bullet points, line breaks, and any markdown. ' +
  'Output ONLY the translation — do not add commentary, labels, or quotation marks around it.'

export const showAiPanel = async (req: AiPanelRequest) => {
  disposePanel()

  const version = requestVersion
  let aiSettings, cfgRaw
  try {
    ;[aiSettings, cfgRaw] = await Promise.all([
      readAiSettings(),
      chrome.storage.local.get({ translationLanguage: '' }),
    ])
  } catch {
    if (version !== requestVersion) return
    current = buildPanel(req.headline, '')
    current.status.textContent = 'Error: Could not read AI settings. Try again.'
    current.status.classList.add('me-sum-error')
    current.regenerateBtn.disabled = true
    return
  }
  if (version !== requestVersion) return
  const translationLanguage: string = cfgRaw.translationLanguage ?? ''
  current = buildPanel(req.headline, translationLanguage)
  const panel = current
  let runId = 0
  const setStatus = (msg: string, isError = false) => {
    if (current !== panel) return
    panel.status.textContent = msg
    panel.status.classList.toggle('me-sum-error', isError)
  }
  const resetPanelContent = () => {
    panel.bodyEn.classList.add('me-sum-pending')
    panel.bodyEn.textContent = 'Waiting for response…'
    if (panel.bodyTranslation) {
      panel.bodyTranslation.classList.add('me-sum-pending')
      panel.bodyTranslation.textContent = 'Waiting for the English result before translating...'
    }
  }

  const cfg: AiProviderConfig = getAiConfig(aiSettings)
  const provider = cfg.provider
  if (!cfg.model) {
    setStatus(
      provider === 'ollama'
        ? 'No model selected. Open Options to pick one.'
        : 'No cloud model configured. Open Options to set one.',
      true,
    )
    return
  }
  if (provider !== 'ollama' && !cfg.apiKey) {
    setStatus(`No ${provider} API key configured. Open Options to add one.`, true)
    return
  }
  if (!req.articleText || !req.articleText.trim()) {
    setStatus('No article content detected on this page.', true)
    return
  }
  if (!req.instruction || !req.instruction.trim()) {
    setStatus('No instruction provided.', true)
    return
  }

  const runGeneration = async () => {
    if (current !== panel) return
    const thisRun = ++runId
    const isCurrent = () => current === panel && thisRun === runId
    const reportStatus = (msg: string, isError = false) => { if (isCurrent()) setStatus(msg, isError) }
    disconnectPorts()
    resetPanelContent()
    panel.regenerateBtn.disabled = true
    setStatus(`Connecting to ${provider}…`)

    try {
      const english = await streamInto(
        panel.bodyEn,
        cfg,
        {
          instruction: req.instruction,
          title: req.articleTitle,
          text: req.articleText,
          context: req.extraContext,
        },
        reportStatus,
        isCurrent,
      )
      if (!isCurrent()) return
      if (!english.trim() || !panel.bodyTranslation) {
        setStatus('Done.')
        return
      }

      setStatus(`Translating to ${labelForLanguage(translationLanguage)}…`)
      panel.bodyTranslation.textContent = 'Translating...'
      try {
        await streamInto(
          panel.bodyTranslation,
          cfg,
          {
            instruction: buildTranslateInstruction(translationLanguage),
            title: '',
            text: english,
          },
          reportStatus,
          isCurrent,
        )
        if (isCurrent()) setStatus('Done.')
      } catch (error: any) {
        if (error?.message !== 'cancelled') {
          reportStatus('Error: ' + (error?.message || 'Request failed.'), true)
        }
      }
    } catch (error: any) {
      if (error?.message !== 'cancelled') {
        reportStatus('Error: ' + (error?.message || 'Request failed.'), true)
      }
    } finally {
      if (isCurrent()) {
        panel.regenerateBtn.disabled = false
      }
    }
  }

  panel.regenerateBtn.addEventListener('click', runGeneration)
  runGeneration()
}
