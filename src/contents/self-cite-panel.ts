// Floating "Cite yourself" button + panel, shown only on the Medium story
// editor page. Lists the author's own top-earning past posts (real revenue,
// pulled live via self-cite.ts) and copies a chosen post's URL to the
// clipboard — paste it on its own line in the editor and Medium turns it
// into a native mixtape preview card automatically.

import { fetchTopEarners, isMediumEditorPage, type SelfCitePost } from './lib/self-cite'
import { showToast } from './util/toast'

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
  width: 380px;
  max-height: 60vh;
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
}
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

const renderPanel = (username: string, posts: SelfCitePost[] | null, error: string | null) => {
  closePanel()
  const el = document.createElement('div')
  el.id = PANEL_ID

  const header = document.createElement('div')
  header.className = 'me-sc-header'
  header.textContent = `@${username} 的过往表现（按真实收益排序）`
  el.appendChild(header)

  const sub = document.createElement('div')
  sub.className = 'me-sc-sub'
  sub.textContent = '点击复制链接，粘贴到正文单独一行会自动生成 Medium 卡片'
  el.appendChild(sub)

  if (error) {
    const empty = document.createElement('div')
    empty.className = 'me-sc-empty'
    empty.textContent = `拉取失败：${error}`
    el.appendChild(empty)
  } else if (!posts || posts.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'me-sc-empty'
    empty.textContent = '加载中…'
    el.appendChild(empty)
  } else {
    for (const p of posts) {
      const item = document.createElement('div')
      item.className = 'me-sc-item'

      const title = document.createElement('div')
      title.className = 'me-sc-title'
      title.textContent = p.title
      item.appendChild(title)

      const meta = document.createElement('div')
      meta.className = 'me-sc-meta'
      const pub = p.publication ? `${p.publication} · ` : ''
      meta.textContent = `${pub}$${p.revenueUsd.toFixed(2)}`
      item.appendChild(meta)

      item.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(p.url)
          showToast('链接已复制，粘贴到正文会自动生成卡片')
        } catch {
          showToast('复制失败，请手动复制：' + p.url)
        }
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
    renderPanel(username, null, null)
    try {
      const posts = await fetchTopEarners(username, 6)
      renderPanel(username, posts, null)
    } catch (e) {
      renderPanel(username, null, (e as Error).message)
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
  el.textContent = '🔗 自引用'
  el.title = '插入你自己过去表现最好的一篇文章链接'
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
