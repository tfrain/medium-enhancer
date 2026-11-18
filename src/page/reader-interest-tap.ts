// Reader Interests tap (Pro, 0.12). Runs in the page's own world so it can see
// the GraphQL answers Medium's profile page fetches for itself — the Activity
// tab's claps / responses / highlights, the public lists, and the signed-in
// viewer's id. It never sends a request of its own: it only copies the answer
// of a request Medium already made (AGENTS.md §3: only what the open page
// already shows). The isolated content script decides whether to use it (the
// setting and Pro live there; this world has no chrome.* API).
//
// Messages: { source: TAP_SOURCE, kind: 'data', ops, json } for each answer, and
// a replay of the last few answers when the content script asks
// ({ source: TAP_SOURCE, kind: 'replay' }) — it loads at document_end, after
// Medium may already have fetched the first Activity page.
//
// Not under src/contents/: Plasmo would register it itself and swallow a
// failed registration. src/shared/main-world.ts registers it (MAIN world,
// document_start, *.medium.com) and replaces a stale copy after an update.

import { TAP_SOURCE, isWatched, operationsInBody } from '../shared/reader-interest'

const REPLAY_LIMIT = 8

export const installReaderInterestTap = (win: any) => {
  if (!win || win.__meReaderInterestTap || typeof win.fetch !== 'function') return
  win.__meReaderInterestTap = true
  const originalFetch = win.fetch
  const recent: { ops: unknown; json: unknown }[] = []
  const post = (message: object) => {
    try { win.postMessage({ source: TAP_SOURCE, ...message }, win.location.origin) } catch { /* page is going away */ }
  }

  const tapped = function (this: unknown, input: unknown, init?: { body?: unknown }) {
    const result = originalFetch.apply(win, arguments as any)
    try {
      const ops = operationsInBody(init?.body)
      if (isWatched(ops)) {
        Promise.resolve(result)
          .then((res: any) => (res && res.ok ? res.clone().json() : null))
          .then((json: unknown) => {
            if (!json) return
            const item = { ops, json }
            recent.push(item)
            if (recent.length > REPLAY_LIMIT) recent.shift()
            post({ kind: 'data', ...item })
          })
          .catch(() => { /* Medium's own code handles its errors */ })
      }
    } catch { /* never break Medium's request */ }
    return result
  }
  win.fetch = tapped

  win.addEventListener('message', (event: any) => {
    if (event.source !== win || event.data?.source !== TAP_SOURCE || event.data.kind !== 'replay') return
    for (const item of recent) post({ kind: 'data', ...item })
  })
}

installReaderInterestTap(typeof window === 'undefined' ? null : window)
