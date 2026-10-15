import { AI_PRESETS } from './ui/ai-presets'
import { extractArticle, extractArticleTextForAI } from './lib/extract'
import { getContentWindow } from './lib/iframe'
import { mountSummaryBall, unmountSummaryBall } from './ui/summary-ball'
import { showAiPanel } from './ui/summary-panel'
import { mountSelfCiteBall, unmountSelfCiteBall } from './ui/self-cite-panel'
import { DEFAULT_SITE_ALLOWLIST, isHostAllowed, mergeDefaultSiteAllowlist } from '../shared/site-access'
import { clipCurrentMediumArticleAsMarkdown } from './markdown/medium-to-markdown'
import { getStorage, OBSIDIAN_SETTINGS_DEFAULTS, sendClipToObsidian } from '../shared/obsidian-clip'
import type { PlasmoCSConfig } from "plasmo"

// Registered up front only for the default site allowlist (keep in sync with
// DEFAULT_SITE_ALLOWLIST; Plasmo needs a literal here). Sites the user adds are
// registered at runtime by the background worker, and on any other page the
// script is injected when the user clicks the menu, shortcut or popup button
// (see shared/injection.ts). A "*." pattern also matches the bare domain.
export const config: PlasmoCSConfig = {
  matches: [
    "https://*.medium.com/*",
    "https://*.inoreader.com/*",
    "https://*.innoreader.com/*",
    "https://*.itnext.io/*",
    "https://*.uxdesign.cc/*",
    "https://*.gopubby.com/*",
    "https://*.towardsai.net/*",
    "https://*.bettermarketing.pub/*",
    "https://*.writingcooperative.com/*"
  ],
  run_at: "document_end",
}

// A second copy (e.g. two quick clicks racing the ping) must not double up.
const alreadyLoaded = (window as any).__mediumEnhancerLoaded === true
;(window as any).__mediumEnhancerLoaded = true

if (window === getContentWindow() && !alreadyLoaded) {
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

      // Explicit-click-only: fired by the "Convert Page to Markdown" context
      // menu item or popup button. Works on any site — deliberately NOT
      // gated by the feature site-allowlist below, and never runs on its own.
      // Mirrors the existing "Clip to Obsidian" AI-ball button: when the
      // Obsidian Clipper is enabled it goes to the same configured vault
      // folder (default "clippers"); otherwise it falls back to a plain
      // file download.
      if (typeof request === 'object' && request?.type === 'clipPageAsMarkdown') {
        (async () => {
          try {
            const clip = clipCurrentMediumArticleAsMarkdown()
            const settings = await getStorage(OBSIDIAN_SETTINGS_DEFAULTS)
            if (settings.obsidianClipperEnabled) {
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
    const allowlist = mergeDefaultSiteAllowlist(items.siteAllowlist || DEFAULT_SITE_ALLOWLIST)
    const siteAllowed = isHostAllowed(window.location.hostname, allowlist)
    if (!siteAllowed) {
      unmountSummaryBall()
      unmountSelfCiteBall()
      return
    }

    if (items.aiSummaryEnabled || items.obsidianClipperEnabled) {
      mountSummaryBall()
    } else {
      unmountSummaryBall()
    }

    if (items.selfCiteEnabled) {
      mountSelfCiteBall() // no-ops itself when not on a Medium editor page
    } else {
      unmountSelfCiteBall()
    }
  }

  const SETTINGS_DEFAULTS = {
    aiSummaryEnabled: true,
    obsidianClipperEnabled: true,
    selfCiteEnabled: true,
    siteAllowlist: DEFAULT_SITE_ALLOWLIST,
  }

  chrome.storage.local.get(SETTINGS_DEFAULTS, function (items) {
    applyFeaturesForCurrentSite(items)
  });

  // React to capability toggles from the options page without needing a reload
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes.aiSummaryEnabled || changes.obsidianClipperEnabled || changes.selfCiteEnabled || changes.siteAllowlist) {
      chrome.storage.local.get(SETTINGS_DEFAULTS, function (items) {
        applyFeaturesForCurrentSite(items)
      });
    }
  });

  // Medium is a client-side-routed SPA — this content script only runs once
  // at document_end, so re-check the self-cite button's editor-page condition
  // whenever the URL changes (e.g. navigating from a draft list into /edit).
  let lastPath = window.location.pathname
  window.setInterval(() => {
    if (window.location.pathname === lastPath) return
    lastPath = window.location.pathname
    chrome.storage.local.get(SETTINGS_DEFAULTS, function (items) {
      applyFeaturesForCurrentSite(items)
    });
  }, 1000)
}
