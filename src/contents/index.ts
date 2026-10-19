import { showToast } from './util/toast'
import { AI_PRESETS } from './ui/ai-presets'
import { extractArticle, extractArticleTextForAI } from './lib/extract'
import { disposePanel, showAiPanel } from './ui/summary-panel'
import { mountQuoteCardButton, openQuoteCardFromSelection, resetQuoteCard } from './ui/quote-card-panel'
import { mountSelfCiteBall, unmountSelfCiteBall } from './ui/self-cite-panel'
import { clipCurrentMediumArticleAsMarkdown } from './markdown/medium-to-markdown'
import { sendClipToObsidian } from '../shared/obsidian-clip'
import type { PlasmoCSConfig } from "plasmo"

// Runs on its own on Medium for Cite My Story in the editor and quote cards in stories.
// Everywhere else (summary, Markdown export) it is injected when the user
// clicks the menu, shortcut or popup button (see shared/injection.ts).
export const config: PlasmoCSConfig = {
  matches: [
    "https://*.medium.com/*", "https://ai.gopubby.com/*", "https://bettermarketing.pub/*",
    "https://itnext.io/*", "https://pub.towardsai.net/*", "https://uxdesign.cc/*", "https://writingcooperative.com/*",
  ],
  run_at: "document_end",
}

// A second copy (e.g. two quick clicks racing the ping) must not double up.
const alreadyLoaded = (window as any).__mediumEnhancerLoaded === true
;(window as any).__mediumEnhancerLoaded = true

if (window === window.top && !alreadyLoaded) {
  chrome.runtime.onMessage.addListener(
    (request: any, sender, sendResponse) => {
      // Lets shared/injection.ts see that this tab already has the script.
      if (typeof request === 'object' && request?.type === 'me-ping') {
        sendResponse({ ok: true })
        return
      }
      if (typeof request === 'object' && request?.type === 'showSummaryPanel') {
        try {
          const article = extractArticle()
          const text = extractArticleTextForAI(article)
          const summarize = AI_PRESETS.find((p) => p.id === 'summarize') || AI_PRESETS[0]
          showAiPanel({
            headline: summarize.label,
            instruction: summarize.instruction,
            articleText: text,
            articleTitle: document.title || '',
          })
          sendResponse({ ok: true })
        } catch (e) {
          sendResponse({ ok: false, error: (e as Error).message })
        }
      }

      if (request?.type === 'showQuoteCard') {
        openQuoteCardFromSelection(String(request.selectionText || ''))
        sendResponse({ ok: true })
        return
      }

      if (request?.type === 'showExportToast') {
        showToast(String(request.text || ''))
        sendResponse({ ok: true })
        return
      }

      if (typeof request === 'object' && request?.type === 'clipPageAsMarkdown') {
        (async () => {
          try {
            const clip = clipCurrentMediumArticleAsMarkdown()
            if (request.target !== 'download' && request.target !== 'obsidian') throw new Error('Unknown export target.')
            if (request.target === 'obsidian') {
              const result = await sendClipToObsidian(clip)
              if (result.ok === false) throw new Error(result.error)
              sendResponse({ ok: true, mode: 'obsidian', filepath: result.filepath })
            } else {
              sendResponse({ ok: true, mode: 'download', markdown: clip.markdown, title: clip.title })
            }
          } catch (e) {
            sendResponse({ ok: false, error: (e as Error).message })
          }
        })()
        return true
      }
    },
  )

  const applyFeaturesForCurrentSite = (items) => {
    if (items.selfCiteEnabled) {
      mountSelfCiteBall() // no-ops itself when not on a Medium editor page
    } else {
      unmountSelfCiteBall()
    }
  }

  const SETTINGS_DEFAULTS = {
    selfCiteEnabled: true,
  }

  mountQuoteCardButton()

  let settingsVersion = 0
  const loadFeatures = () => {
    const version = ++settingsVersion
    chrome.storage.local.get(SETTINGS_DEFAULTS, items => {
      if (version === settingsVersion) applyFeaturesForCurrentSite(items)
    })
  }
  loadFeatures()

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes.selfCiteEnabled) return
    // Invalidate pending settings reads and close immediately on disable.
    settingsVersion++
    applyFeaturesForCurrentSite({ selfCiteEnabled: changes.selfCiteEnabled.newValue ?? true })
  })

  // Re-check SPA navigation, including transitions between two editor drafts.
  let lastUrl = window.location.href
  const checkCurrentUrl = () => {
    if (window.location.href === lastUrl) return
    lastUrl = window.location.href
    unmountSelfCiteBall()
    resetQuoteCard()
    disposePanel()
    loadFeatures()
  }
  window.addEventListener('popstate', checkCurrentUrl)
  window.addEventListener('hashchange', checkCurrentUrl)
  window.setInterval(checkCurrentUrl, 250)
}
