# Bug Fixes Design — Medium Enhancer

**Date:** 2026-03-16
**Scope:** Fix 6 confirmed bugs across `css.ts`, `background.ts`, and `contents/index.ts` / `stream.ts`
**Strategy:** Surgical fixes (方案 A) for bugs 1, 3, 4, 5, 6；局部重写 (方案 C) for bug 2

---

## Bug 1 — `css.ts`: `removeCSS` crashes when element already exists

**File:** `src/contents/util/dom/css.ts:25-37`
**Severity:** Critical — any caller of `addCSS` that calls the returned cleaner will throw TypeError

**Root cause:** `style` is declared with `let` but only assigned inside the `if (!document.getElementById(id))` branch. If the element already exists, `style` remains `undefined`, and the returned `removeCSS` closure calls `style.remove()` → crash.

**Fix:** On the first line, resolve the existing element into `style`. If none exists, create and append it. The closure always closes over a valid `HTMLStyleElement`.

```typescript
export const addCSS = function(css: string, id: string): () => void {
  // Assign on first line — style is guaranteed non-null before closure is built
  let style = document.getElementById(id) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.type = 'text/css'
    style.id = id
    style.textContent = css
    document.head.appendChild(style)
  }
  // style is always assigned here; non-null assertion is safe
  return () => style!.remove()
}
```

---

## Bug 2 — `background.ts`: RSS parsing crashes on index out of bounds

**File:** `src/background.ts:117-118`
**Severity:** Critical — `links[1]` and `links[2]` accessed without bounds check; crashes if article has fewer than 3 matching links, making RSS feature completely non-functional on those pages.

**Root cause:** Logic assumes a fixed ordering and count of links matching the article ID query, which is not guaranteed.

**Fix (方案 C — semantic search):** Instead of positional access, search the links array semantically:
- Find a link containing `/feed/@` or ending with `/feed` → user feed
- Find a link containing `/feed/` (non-user) → publication feed
- Extract tags via `/tag/([^/?]+)` from all links

This is robust regardless of link count or order. All `.match()` calls must use optional chaining (`?.`) to guard against `undefined` entries.

The fix **replaces** both the positional access (lines 117-118) and the downstream extraction logic (lines 134-164) with the semantic approach:

```typescript
// Replace lines 117-164 with:
const userFeedLink = links.find(l => l.includes('/feed/@') || /\/feed\/?$/.test(l))
const pubFeedLink  = links.find(l => l.includes('/feed/') && !l.includes('/feed/@'))

const userPath = userFeedLink?.match(/\/\/([^?]+)/)?.[1]   // never crashes
const pubPath  = pubFeedLink?.match(/\/\/([^?]+)/)?.[1]

const userFeed = userPath ?? null
const mediumPublication = pubPath?.match(/medium\.com\/([^?/]+)/)?.[1] ?? null
const publicationDomain = (!mediumPublication && pubPath) ? pubPath : null
```

Note: the existing downstream logic at lines 134-164 is preserved in structure but operated on the safely-extracted `userFeed`, `mediumPublication`, and `publicationDomain` variables — removing all unsafe positional access.

---

## Bug 3 — `background.ts`: `lastUrl` shared across tabs

**File:** `src/background.ts:82-91`
**Severity:** Medium — navigating to the same URL in a second tab skips RSS detection; badge stays stale

**Root cause:** `let lastUrl = ''` is a module-level singleton shared by all tab update events.

**Fix:** Replace with a `Map<tabId, url>`, cleaned up on tab close:

```typescript
const lastUrlByTab = new Map<number, string>()
chrome.tabs.onRemoved.addListener((tabId) => lastUrlByTab.delete(tabId))

// inside onUpdated:
if (changeInfo.status === 'complete' && tab.url && tab.url !== lastUrlByTab.get(tabId)) {
  lastUrlByTab.set(tabId, tab.url)
  ...
}
```

---

## Bug 4 — `index.ts`: Inner MutationObserver shadows outer, leaks on unload

**File:** `src/contents/index.ts:236-247`
**Severity:** Medium — each `trackArticle()` call creates a `const observer` that shadows the outer `let observer`. Calling `unload()` disconnects the outer observer but not these inner ones. They self-disconnect when the article loads, but if `unload()` is called first they persist indefinitely.

**Fix:** Rename the inner observer to avoid shadowing, and track it so `unload()` can clean it up:

```typescript
let innerObserver: MutationObserver | null = null

function trackArticle() {
  ...
  if (innerObserver) innerObserver.disconnect()
  innerObserver = new MutationObserver((mutations, obs) => {
    if (document.querySelector(articleClass)) {
      start()
      obs.disconnect()
      innerObserver = null
    }
  })
  innerObserver.observe(document, { childList: true, subtree: true })
}

function unload() {
  ...
  if (innerObserver) { innerObserver.disconnect(); innerObserver = null }
}
```

---

## Bug 5 — `index.ts`: `renderToc` retry timer race condition

**File:** `src/contents/index.ts:87-130`
**Severity:** Medium — if `renderToc` is called again within 500ms of a previous call, the pending retry from the first call still fires, potentially creating a second TOC instance.

**Fix:** Declare `retryTimer` at module scope (alongside `toc`, `observer`, `isLoad` etc.) so it persists across calls. Cancel it at the start of each new `renderToc`:

```typescript
// module scope — next to other state variables
let retryTimer: ReturnType<typeof setTimeout> | null = null

const renderToc = (article, headings): void => {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }  // cancel stale retry
  if (toc) toc.dispose()
  ...
  retryTimer = setTimeout(() => {
    retryTimer = null
    // retry logic
  }, 500)
}
```

---

## Bug 6 — `stream.ts`: Derived streams never unsubscribe (memory leak)

**File:** `src/contents/util/stream.ts`
**Severity:** Low-Medium — `.map()`, `.filter()`, `.unique()`, `.merge()` subscribe internally but never unsubscribe. On long-running pages, listener arrays grow indefinitely.

**Fix scope:** Full lifecycle management would require major architectural changes. Pragmatic fix: extend `addDisposer` usage in `createToc` to also unsubscribe the main derived streams when `dispose()` is called.

In `toc.ts`, the key streams returned by `contentStream`, `activeHeadingStream`, and `topbarStream` should have their internal subscriptions cleaned up via the existing `disposers` mechanism.

**Audit result — all factory calls already pass `addDisposer`:**
| Location | Call | Passes `addDisposer`? |
|----------|------|-----------------------|
| `activeHeadingStream` (line 77) | `Stream.fromEvent(scroller/window, 'scroll', addDisposer)` | ✅ Yes |
| `contentStream` (line 127) | `Stream.fromEvent(window, 'resize', addDisposer)` | ✅ Yes |
| `createToc` (line 242) | `Stream.fromInterval(60000, addDisposer)` | ✅ Yes |

**Conclusion:** Factory-level event/interval cleanup is already wired correctly via `addDisposer` — no changes needed there.

However, derived streams chained from those factories (e.g., `.map()`, `.throttle()`, `.unique()` calls on lines 82, 128, 214, etc.) still accumulate subscriptions because the `subscribe()` calls inside those operators never return or store their unsubscribe handles. This is a structural limitation of the current stream architecture.

**Scope decision:** Full fix requires refactoring `StreamClass` to propagate disposal through the chain — out of scope for this cycle. The fix for this cycle is limited to confirming factory streams are disposed (already done) and documenting the remaining leak for a future stream-lifecycle refactor.

---

## Out of Scope

- Full reactive stream lifecycle management (would require rewriting stream.ts architecture)
- `toast.ts` — the apparent TDZ issue is not a real bug (closure captures variable binding, `toast` is always assigned before first `set()` call)
- `handle.ts` drag listeners — self-clean via `mouseup`, not a real leak in normal usage

---

## Testing

Since there is no automated test framework, verification is manual:
1. **Bug 1:** Call `addCSS` twice with same ID; returned cleaner from second call must not throw
2. **Bug 2:** Open a Medium article with few author links; RSS badge must appear correctly
3. **Bug 3:** Open same Medium URL in two tabs; both must show RSS badge
4. **Bug 4:** Trigger `unload()` during article load; check DevTools Memory for observer leaks
5. **Bug 5:** Navigate rapidly between articles; only one TOC should appear
6. **Bug 6:** Open a long article, scroll for several minutes; check DevTools Memory for listener growth
