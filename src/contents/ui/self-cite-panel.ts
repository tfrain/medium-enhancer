// Floating "Cite yourself" button + panel, shown only on the Medium story
// editor page. Lists the author's own past posts — ranked by topical
// relevance to the draft being written (revenue only breaks ties, per
// user feedback 2026-07-22: pure revenue ranking surfaced unrelated posts) —
// and copies a bare URL (paste on its own line -> Medium mixtape card).
//
// An earlier version also offered an "AI recommendation" button that asked the local
// AI provider to invent a one-sentence "why read this" recommendation from
// just the two titles. Dropped 2026-07-22: with no real article content to
// work from, the model fabricated plausible-sounding but false connections
// between unrelated pieces — a real instance of the fabrication risk this
// whole project treats as a hard line elsewhere. Writing that sentence by
// hand (you already know what both pieces say) is more reliable than trying
// to prompt-engineer around a problem that's fundamentally an information
// shortage, not a wording problem.

import {
  fetchTopEarners,
  getCurrentDraftTitle,
  isMediumEditorPage,
  scoreRelevance,
  type SelfCitePost,
} from '../lib/self-cite'
import { showToast } from '../util/toast'

const BALL_ID = '__me_selfcite_ball__'
const PANEL_ID = '__me_selfcite_panel__'

const CSS = `
#${BALL_ID} {
  position: fixed;
  bottom: 24px;
  left: 24px;
  padding: 0 14px;
  height: 40px;
  border-radius: 20px;
  background: #1a8917;
  color: #ffffff;
  font-weight: 600;
  font-size: 13px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-shadow: 0 4px 14px rgba(0,0,0,0.22);
  cursor: pointer;
  z-index: 2147483645;
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
  transition: transform 0.15s ease;
}
#${BALL_ID}:hover { transform: scale(1.04); }
#${PANEL_ID} {
  position: fixed;
  bottom: 74px;
  left: 24px;
  width: 400px;
  max-height: 65vh;
  overflow-y: auto;
  background: #ffffff;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.18);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  z-index: 2147483645;
}
#${PANEL_ID} .me-sc-header {
  padding: 10px 14px;
  font-weight: 700;
  font-size: 13px;
  color: #1a1a1a;
  border-bottom: 1px solid #eee;
}
#${PANEL_ID} .me-sc-sub {
  padding: 6px 14px 0;
  font-size: 11px;
  color: #757575;
}
#${PANEL_ID} .me-sc-item {
  padding: 10px 14px;
  border-bottom: 1px solid #f2f2f2;
  cursor: pointer;
}
#${PANEL_ID} .me-sc-item:hover { background: #f7f7f7; }
#${PANEL_ID} .me-sc-title {
  font-size: 13px;
  color: #1a1a1a;
  line-height: 1.4;
  margin-bottom: 3px;
}
#${PANEL_ID} .me-sc-meta {
  font-size: 11px;
  color: #757575;
  margin-bottom: 6px;
}
#${PANEL_ID} .me-sc-relevance {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 8px;
  margin-right: 6px;
}
#${PANEL_ID} .me-sc-relevance.high { background: #d7f3df; color: #0f6b2c; }
#${PANEL_ID} .me-sc-relevance.mid { background: #fdecc8; color: #8a5a00; }
#${PANEL_ID} .me-sc-relevance.low { background: #eeeeee; color: #757575; }
#${PANEL_ID} .me-sc-empty {
  padding: 20px 14px;
  font-size: 12px;
  color: #757575;
}
`

let ballEl: HTMLDivElement | null = null
let panelEl: HTMLDivElement | null = null

const ensureCSS = () => {
  if (document.getElementById(`${BALL_ID}__style`)) return
  const style = document.createElement('style')
  style.id = `${BALL_ID}__style`
  style.textContent = CSS
  document.documentElement.appendChild(style)
}

const closePanel = () => {
  if (panelEl) {
    panelEl.remove()
    panelEl = null
  }
  document.removeEventListener('click', onDocClick, true)
}

const onDocClick = (e: MouseEvent) => {
  if (!panelEl) return
  const target = e.target as Node
  if (panelEl.contains(target) || ballEl?.contains(target)) return
  closePanel()
}

type RankedPost = SelfCitePost & { relevance: number }

const relevanceBand = (score: number): 'high' | 'mid' | 'low' => {
  if (score >= 0.34) return 'high'
  if (score > 0) return 'mid'
  return 'low'
}

const copyText = async (text: string, successMsg: string) => {
  try {
    await navigator.clipboard.writeText(text)
    showToast(successMsg)
  } catch {
    showToast('Copy failed. Please copy it manually.')
  }
}

const renderPanel = (
  username: string,
  draftTitle: string,
  posts: RankedPost[] | null,
  error: string | null,
) => {
  closePanel()
  const el = document.createElement('div')
  el.id = PANEL_ID

  const header = document.createElement('div')
  header.className = 'me-sc-header'
  header.textContent = `@${username}'s past stories (sorted by relevance; earnings only break ties)`
  el.appendChild(header)

  const sub = document.createElement('div')
  sub.className = 'me-sc-sub'
  sub.textContent = draftTitle
    ? `Current draft title: ${draftTitle}`
    : 'Could not read the draft title, so stories are sorted by earnings only.'
  el.appendChild(sub)

  const bestScore = posts && posts.length ? posts[0].relevance : -1

  if (error) {
    const empty = document.createElement('div')
    empty.className = 'me-sc-empty'
    empty.textContent = `Could not load stories: ${error}`
    el.appendChild(empty)
  } else if (!posts) {
    const empty = document.createElement('div')
    empty.className = 'me-sc-empty'
    empty.textContent = 'Loading...'
    el.appendChild(empty)
  } else if (draftTitle && bestScore === 0) {
    // No candidate shares any real title vocabulary with the draft — showing
    // a ranked list here would just be the old "irrelevant but ranked" bug
    // wearing a relevance badge. Say so plainly instead of listing anything;
    // per the same rule already used for the Maintainer Profile self-cite
    // workflow, no good match means skip the citation, not settle for one.
    const empty = document.createElement('div')
    empty.className = 'me-sc-empty'
    empty.textContent = 'No related past stories found. Better not to self-cite this time.'
    el.appendChild(empty)
  } else {
    if (draftTitle && bestScore >= 0 && bestScore < 0.34) {
      const warn = document.createElement('div')
      warn.className = 'me-sc-empty'
      warn.style.color = '#8a5a00'
      warn.textContent = 'None of these is a strong match. Judge for yourself whether one is worth linking.'
      el.appendChild(warn)
    }
    for (const p of posts) {
      const item = document.createElement('div')
      item.className = 'me-sc-item'

      const title = document.createElement('div')
      title.className = 'me-sc-title'
      title.textContent = p.title
      item.appendChild(title)

      const meta = document.createElement('div')
      meta.className = 'me-sc-meta'
      const band = relevanceBand(p.relevance)
      const badge = document.createElement('span')
      badge.className = `me-sc-relevance ${band}`
      badge.textContent = band === 'high' ? 'High match' : band === 'mid' ? 'Medium match' : 'Low match'
      meta.appendChild(badge)
      const pub = p.publication ? `${p.publication} · ` : ''
      meta.appendChild(document.createTextNode(`${pub}$${p.revenueUsd.toFixed(2)}`))
      item.appendChild(meta)

      item.addEventListener('click', () => {
        copyText(p.url, 'Link copied. Paste it on its own line to make a card.')
        closePanel()
      })

      el.appendChild(item)
    }
  }

  document.body.appendChild(el)
  panelEl = el
  // Defer listener registration so the opening click doesn't immediately close it.
  window.setTimeout(() => document.addEventListener('click', onDocClick, true), 0)
}

const DEFAULT_USERNAME = 'wesley-wei'

const openPanel = async () => {
  if (panelEl) {
    closePanel()
    return
  }
  chrome.storage.local.get({ selfCiteUsername: DEFAULT_USERNAME }, async (items) => {
    const username = items.selfCiteUsername || DEFAULT_USERNAME
    const draftTitle = getCurrentDraftTitle()
    renderPanel(username, draftTitle, null, null)
    try {
      // Pull a larger pool than we'll display, so relevance re-ranking has
      // something to actually rank instead of just the top-6-by-revenue.
      const pool = await fetchTopEarners(username, 20)
      const ranked: RankedPost[] = pool
        .map((p) => ({ ...p, relevance: scoreRelevance(draftTitle, p.title) }))
        .sort((a, b) => b.relevance - a.relevance || b.revenueUsd - a.revenueUsd)
        .slice(0, 6)
      renderPanel(username, draftTitle, ranked, null)
    } catch (e) {
      renderPanel(username, draftTitle, null, (e as Error).message)
    }
  })
}

export const mountSelfCiteBall = () => {
  if (!isMediumEditorPage()) {
    unmountSelfCiteBall()
    return
  }
  if (ballEl) return
  if (!document.body) {
    window.addEventListener('DOMContentLoaded', mountSelfCiteBall, { once: true })
    return
  }
  ensureCSS()
  const existing = document.getElementById(BALL_ID)
  if (existing) existing.remove()

  const el = document.createElement('div')
  el.id = BALL_ID
  el.textContent = '🔗 Cite my story'
  el.title = 'Link one of your own best-performing past stories'
  el.addEventListener('click', openPanel)

  document.body.appendChild(el)
  ballEl = el
}

export const unmountSelfCiteBall = () => {
  closePanel()
  if (ballEl) {
    ballEl.remove()
    ballEl = null
  }
}
