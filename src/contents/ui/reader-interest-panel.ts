// Reader Interests (Pro, 0.12): on a Medium profile page, a "Reader interests"
// button opens a panel with what that reader claps, highlights and responds
// to — top tags, writers, publications, their highlights and responses, and
// which of your own stories they engaged with.
//
// Data comes only from the answers Medium's own page fetched (see
// ../reader-interest-tap.ts). No request is made here, nothing is written to
// storage, and everything is dropped when the tab closes. Scroll the Activity
// tab to let Medium load more; the panel updates as pages arrive.

import { isPro } from '../../shared/pro'
import {
  TAP_SOURCE,
  activityPage,
  addActivityPage,
  countsLine,
  emptyProfile,
  formatDay,
  isActivityUrl,
  kindLabel,
  listsPage,
  pairResults,
  profileUsernameFromUrl,
  summarize,
  summaryMarkdown,
  viewerIdFrom,
  type ReaderProfile,
} from '../../shared/reader-interest'
import { darkCss } from '../../shared/theme'
import { themeElement } from '../lib/theme'
import { showToast } from '../util/toast'

const BALL_ID = '__me_reader_ball__'
const PANEL_ID = '__me_reader_panel__'

const CSS = `
#${BALL_ID} {
  position: fixed; bottom: 24px; left: 24px; height: 40px; padding: 0 14px;
  border-radius: 20px; border: 0; background: #1a8917; color: #fff;
  font: 600 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  box-shadow: 0 4px 14px rgba(0,0,0,0.22); cursor: pointer; z-index: 2147483645;
  display: flex; align-items: center; gap: 6px; user-select: none;
}
#${BALL_ID}:hover { transform: scale(1.04); }
#${BALL_ID} .me-ri-pro { font-size: 10px; background: rgba(255,255,255,0.25); border-radius: 8px; padding: 1px 6px; }
#${PANEL_ID} {
  position: fixed; bottom: 74px; left: 24px; width: 420px; max-height: 70vh; overflow-y: auto;
  background: #fff; color: #1a1a1a; border: 1px solid #e0e0e0; border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.18); z-index: 2147483645;
  font: 13px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
#${PANEL_ID} .me-ri-head { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-bottom: 1px solid #eee; font-weight: 700; }
#${PANEL_ID} .me-ri-head span { flex: 1; }
#${PANEL_ID} .me-ri-btn { font-weight: 600; font-size: 11px; font-family: inherit; border: 1px solid #ccc; background: #fff; color: #1a1a1a; border-radius: 12px; padding: 3px 10px; cursor: pointer; }
#${PANEL_ID} .me-ri-sub { padding: 8px 14px 0; font-size: 11px; color: #757575; }
#${PANEL_ID} .me-ri-sec { padding: 10px 14px 4px; }
#${PANEL_ID} .me-ri-h { font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: #757575; margin-bottom: 6px; }
#${PANEL_ID} .me-ri-chip { display: inline-block; margin: 0 6px 6px 0; padding: 2px 8px; border-radius: 10px; background: #f2f2f2; font-size: 12px; }
#${PANEL_ID} .me-ri-chip b { color: #1a8917; margin-left: 4px; font-weight: 700; }
#${PANEL_ID} .me-ri-row { margin-bottom: 8px; }
#${PANEL_ID} .me-ri-quote { border-left: 3px solid #1a8917; padding-left: 8px; font-style: italic; }
#${PANEL_ID} .me-ri-meta { font-size: 11px; color: #757575; }
#${PANEL_ID} a { color: inherit; text-decoration: underline; text-decoration-color: #bbb; }
#${PANEL_ID} .me-ri-yours { background: #eaf6ea; border-radius: 8px; padding: 8px 10px; }
#${PANEL_ID} .me-ri-empty { padding: 16px 14px; color: #757575; }
`

const DARK_CSS = darkCss([PANEL_ID], `
#${PANEL_ID} { background: #1e1e1e; color: #f0f0f0; border-color: #3a3a3a; }
#${PANEL_ID} .me-ri-head { border-bottom-color: #333; }
#${PANEL_ID} .me-ri-btn { background: #2a2a2a; color: #f0f0f0; border-color: #444; }
#${PANEL_ID} .me-ri-sub, #${PANEL_ID} .me-ri-h, #${PANEL_ID} .me-ri-meta, #${PANEL_ID} .me-ri-empty { color: #9a9a9a; }
#${PANEL_ID} .me-ri-chip { background: #2c2c2c; }
#${PANEL_ID} .me-ri-chip b { color: #7fd89a; }
#${PANEL_ID} .me-ri-yours { background: #1d3a26; }
`)

// ---- In-memory state (this tab only) ------------------------------------------

const profiles = new Map<string, ReaderProfile>()
const idByUsername = new Map<string, string>()
let viewerId = ''
let latestUserId = '' // the profile whose data arrived last since navigation
let enabled = false
let listening = false
let pro = false
let ballEl: HTMLButtonElement | null = null
let panelEl: HTMLDivElement | null = null
let pageUrl = ''

const profileFor = (userId: string) => {
  let p = profiles.get(userId)
  if (!p) profiles.set(userId, (p = emptyProfile(userId)))
  return p
}

const learnUsername = (userId: string, username?: string) => {
  if (!username) return
  idByUsername.set(username.toLowerCase(), userId)
  profileFor(userId).username = username
}

const currentProfile = (): ReaderProfile | null => {
  const username = profileUsernameFromUrl(window.location.href)
  const id = (username && idByUsername.get(username)) || latestUserId
  return id ? profiles.get(id) || null : null
}

export const handleTapMessage = (data: any) => {
  if (data?.source !== TAP_SOURCE || data.kind !== 'data' || !Array.isArray(data.ops)) return
  for (const { op, result } of pairResults(data.ops, data.json)) {
    if (op.name === 'NavBarQuery') {
      viewerId = viewerIdFrom(result) || viewerId
    } else if (op.name === 'UserActivitiesQuery') {
      const page = activityPage(op, result)
      if (!page) continue
      addActivityPage(profileFor(page.userId), page)
      learnUsername(page.userId, page.username)
      latestUserId = page.userId
    } else if (op.name === 'UserCatalogsListQuery') {
      const page = listsPage(op, result)
      if (!page) continue
      profileFor(page.userId).lists = page.lists
      learnUsername(page.userId, page.username)
      latestUserId = latestUserId || page.userId
    }
  }
  syncBall()
  if (panelEl) renderPanel()
}

const onMessage = (event: MessageEvent) => {
  if (event.source !== window) return
  handleTapMessage(event.data)
}

// ---- UI -----------------------------------------------------------------------

const ensureCSS = () => {
  if (document.getElementById(`${BALL_ID}__style`)) return
  const style = document.createElement('style')
  style.id = `${BALL_ID}__style`
  style.textContent = CSS + DARK_CSS
  document.documentElement.appendChild(style)
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text) node.textContent = text
  return node
}

const link = (title: string, url: string) => {
  const a = el('a', '', title || url)
  if (/^https:\/\//.test(url)) {
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
  }
  return a
}

const section = (title: string) => {
  const sec = el('div', 'me-ri-sec')
  sec.appendChild(el('div', 'me-ri-h', title))
  return sec
}

const closePanel = () => {
  panelEl?.remove()
  panelEl = null
  document.removeEventListener('click', onDocClick, true)
}

const onDocClick = (e: MouseEvent) => {
  const target = e.target as Node
  if (panelEl?.contains(target) || ballEl?.contains(target)) return
  closePanel()
}

const renderPanel = () => {
  const old = panelEl
  const panel = el('div')
  panel.id = PANEL_ID
  themeElement(panel)
  const profile = currentProfile()
  const pageUser = profileUsernameFromUrl(window.location.href)
  const name = profile?.username || pageUser

  const head = el('div', 'me-ri-head')
  head.appendChild(el('span', '', name ? `@${name} · reader interests` : 'Reader interests'))
  panel.appendChild(head)

  if (!pro) {
    panel.appendChild(el('div', 'me-ri-empty',
      'Reader Interests is part of Medium Enhancer Pro. Unlock Pro in the extension Options (click the extension icon, then Settings).'))
  } else if (!profile || profile.activities.size === 0) {
    panel.appendChild(el('div', 'me-ri-empty', isActivityUrl(window.location.href)
      ? 'No activity data from this page yet. Scroll the list, or reload the page if Medium showed it from cache.'
      : "Open this reader's Activity tab. Medium Enhancer reads only what that page loads."))
    if (profile?.lists?.length) appendLists(panel, profile)
  } else {
    const s = summarize(profile.activities.values(), viewerId)
    const copy = el('button', 'me-ri-btn', 'Copy as Markdown')
    copy.type = 'button'
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(summaryMarkdown(name, s, profile.lists, profile.hasMore))
        showToast('Reader interests copied as Markdown.')
      } catch {
        showToast('Copy failed. Please try again.')
      }
    })
    head.appendChild(copy)

    panel.appendChild(el('div', 'me-ri-sub',
      `Based on ${countsLine(s)}, ${formatDay(s.from)} – ${formatDay(s.to)}.` +
      (profile.hasMore ? ' Scroll the Activity tab to load more.' : '')))

    if (s.yourStories.length) {
      const sec = section('Your stories they engaged with')
      const box = el('div', 'me-ri-yours')
      for (const a of s.yourStories) {
        const row = el('div', 'me-ri-row')
        row.appendChild(el('span', 'me-ri-meta', `${kindLabel(a.kind)} · `))
        row.appendChild(link(a.title, a.url))
        box.appendChild(row)
      }
      sec.appendChild(box)
      panel.appendChild(sec)
    }

    if (s.tags.length) {
      const sec = section('Top tags (highlight 3 · response 2 · clap 1)')
      for (const t of s.tags) {
        const chip = el('span', 'me-ri-chip', t.name)
        chip.appendChild(el('b', '', String(t.score)))
        sec.appendChild(chip)
      }
      panel.appendChild(sec)
    }

    if (s.highlights.length) {
      const sec = section('Highlights')
      for (const a of s.highlights) {
        const row = el('div', 'me-ri-row')
        row.appendChild(el('div', 'me-ri-quote', a.quote))
        const meta = el('div', 'me-ri-meta', `${formatDay(a.at)} · `)
        meta.appendChild(link(a.title, a.url))
        row.appendChild(meta)
        sec.appendChild(row)
      }
      panel.appendChild(sec)
    }

    if (s.responses.length) {
      const sec = section('Their responses')
      for (const a of s.responses) {
        const row = el('div', 'me-ri-row')
        row.appendChild(el('div', '', a.response))
        const meta = el('div', 'me-ri-meta', `${formatDay(a.at)} · on `)
        meta.appendChild(link(a.title, a.url))
        row.appendChild(meta)
        sec.appendChild(row)
      }
      panel.appendChild(sec)
    }

    const ranked = (title: string, rows: { name: string; count: number }[]) => {
      if (!rows.length) return
      const sec = section(title)
      for (const r of rows) {
        const chip = el('span', 'me-ri-chip', r.name)
        chip.appendChild(el('b', '', String(r.count)))
        sec.appendChild(chip)
      }
      panel.appendChild(sec)
    }
    ranked('Writers', s.authors)
    ranked('Publications', s.publications)
    appendLists(panel, profile)
  }

  if (old) old.replaceWith(panel)
  else document.body.appendChild(panel)
  panelEl = panel
  if (!old) window.setTimeout(() => { if (panelEl === panel) document.addEventListener('click', onDocClick, true) }, 0)
}

const appendLists = (panel: HTMLElement, profile: ReaderProfile) => {
  if (!profile.lists?.length) return
  const sec = section('Public lists')
  for (const l of profile.lists) {
    const chip = el('span', 'me-ri-chip', l.name)
    chip.appendChild(el('b', '', String(l.count)))
    sec.appendChild(chip)
  }
  panel.appendChild(sec)
}

const togglePanel = async () => {
  if (panelEl) { closePanel(); return }
  pro = await isPro().catch(() => false)
  if (!enabled || !ballEl) return
  renderPanel()
}

const syncBall = () => {
  const show = enabled && !!document.body && !!profileUsernameFromUrl(window.location.href)
  if (!show) {
    closePanel()
    ballEl?.remove()
    ballEl = null
    return
  }
  if (ballEl) return
  ensureCSS()
  const ball = el('button')
  ball.id = BALL_ID
  ball.type = 'button'
  ball.title = "What this reader claps, highlights and responds to (from the page's own Activity data)"
  ball.appendChild(document.createTextNode('👤 Reader interests'))
  ball.appendChild(el('span', 'me-ri-pro', 'Pro'))
  ball.addEventListener('click', () => { void togglePanel() })
  document.body.appendChild(ball)
  ballEl = ball
}

/** Called by index.ts on load, on setting changes and after SPA navigation. */
export const mountReaderInterest = () => {
  enabled = true
  if (!listening) {
    listening = true
    window.addEventListener('message', onMessage)
    // Ask the page-world tap for answers it saw before this script loaded.
    window.postMessage({ source: TAP_SOURCE, kind: 'replay' }, window.location.origin)
  }
  if (window.location.href !== pageUrl) {
    if (profileUsernameFromUrl(window.location.href) !== profileUsernameFromUrl(pageUrl)) latestUserId = ''
    pageUrl = window.location.href
    closePanel()
  }
  syncBall()
}

export const unmountReaderInterest = () => {
  enabled = false
  closePanel()
  ballEl?.remove()
  ballEl = null
  if (listening) {
    listening = false
    window.removeEventListener('message', onMessage)
  }
  profiles.clear()
  idByUsername.clear()
  latestUserId = ''
}
