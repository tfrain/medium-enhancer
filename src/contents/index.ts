import { saveCurrentStory, highlightCurrentStory } from './lib/bookshelf'
import { applyInPageHighlights, clearInPageHighlights, setInPageHighlightsEnabled } from './lib/inpage-highlights'
import { showToast } from './util/toast'
import { AI_PRESETS } from './ui/ai-presets'
import { extractArticle, extractArticleTextForAI } from './lib/extract'
import { disposePanel, showAiPanel } from './ui/summary-panel'
import { mountQuoteCardButton, openQuoteCardFromSelection, resetQuoteCard, setQuoteCardHoverEnabled } from './ui/quote-card-panel'
import { quoteStoryRoot } from './lib/quote-card'
import { mountSelfCiteBall, unmountSelfCiteBall } from './ui/self-cite-panel'
import { clipCurrentMediumArticleAsMarkdown } from './markdown/medium-to-markdown'
import { sendClipToObsidian } from '../shared/obsidian-clip'
import type { PlasmoCSConfig } from "plasmo"

// The context-menu click focuses the page, so the async clipboard API usually
// works; when the page has lost focus Chrome rejects it, and the legacy
// execCommand path still copies.
const copyTextToClipboard = async (text: string) => {
  try { await navigator.clipboard.writeText(text); return } catch { /* fall back below */ }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error('Could not copy to the clipboard.')
}


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

      if (request?.type === 'saveToBookshelf' || request?.type === 'highlightToBookshelf') {
        (request.type === 'saveToBookshelf'
          ? saveCurrentStory(request.archiveOnly === true, typeof request.expectedKey === 'string' ? request.expectedKey : undefined)
          : highlightCurrentStory(String(request.selectionText || '')))
          .then(result => {
            if (request.type === 'highlightToBookshelf') void applyInPageHighlights()
            sendResponse({ ...result, ok: true })
          })
          .catch(error => sendResponse({ ok: false, error: error.message || String(error) }))
        return true
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
            if (request.target !== 'download' && request.target !== 'obsidian' && request.target !== 'copy') throw new Error('Unknown export target.')
            if (request.target === 'copy') {
              await copyTextToClipboard(clip.markdown)
              sendResponse({ ok: true, mode: 'copy', title: clip.title })
              return
            }
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
    setQuoteCardHoverEnabled(items.quoteCardHoverEnabled)
    setInPageHighlightsEnabled(items.bookshelfEnabled && items.bookshelfInPageHighlights)
    if (items.selfCiteEnabled) {
      mountSelfCiteBall() // no-ops itself when not on a Medium editor page
    } else {
      unmountSelfCiteBall()
    }
  }

  const SETTINGS_DEFAULTS = {
    selfCiteEnabled: true,
    quoteCardHoverEnabled: true,
    bookshelfEnabled: true,
    bookshelfInPageHighlights: true,
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
    if (area !== 'local' || !(changes.selfCiteEnabled || changes.quoteCardHoverEnabled || changes.bookshelfEnabled || changes.bookshelfInPageHighlights)) return
    // Invalidate pending settings reads and close immediately on disable.
    settingsVersion++
    if (changes.selfCiteEnabled) {
      if (changes.selfCiteEnabled.newValue ?? true) mountSelfCiteBall()
      else unmountSelfCiteBall()
    }
    if (changes.quoteCardHoverEnabled) setQuoteCardHoverEnabled(changes.quoteCardHoverEnabled.newValue ?? true)
    loadFeatures()
  })

  // Re-check SPA navigation, including transitions between two editor drafts.
  let lastUrl = window.location.href
  let lastQuoteRoot = quoteStoryRoot()
  const checkCurrentUrl = () => {
    const root = quoteStoryRoot()
    if (window.location.href === lastUrl) {
      // Medium can insert or replace the article after its URL has changed.
      if (root !== lastQuoteRoot) {
        lastQuoteRoot = root
        resetQuoteCard()
        clearInPageHighlights()
        loadFeatures()
      }
      return
    }
    lastUrl = window.location.href
    lastQuoteRoot = root
    unmountSelfCiteBall()
    resetQuoteCard()
    clearInPageHighlights()
    disposePanel()
    loadFeatures()
  }
  window.addEventListener('popstate', checkCurrentUrl)
  window.addEventListener('hashchange', checkCurrentUrl)
  window.setInterval(checkCurrentUrl, 250)
}
