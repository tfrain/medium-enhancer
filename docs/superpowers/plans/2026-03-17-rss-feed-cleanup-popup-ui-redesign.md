# RSS Feed Cleanup + Popup UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove invalid tag feeds from RSS generation and replace the bare-link popup with a styled card-based UI that supports dark/light mode.

**Architecture:** `background.ts` is simplified to emit at most 2 typed feeds (user + publication); `popup.tsx` is rewritten to render feed cards from a 3-state model (`null` = loading, `true` = Medium page, `false` = not Medium); a new co-located `popup.css` drives theming via CSS custom properties and `prefers-color-scheme`.

**Tech Stack:** Chrome MV3, Plasmo (Parcel wrapper), React, TypeScript. No test framework — verification is manual via `pnpm dev` + extension reload.

---

## Chunk 1: background.ts — Feed Interface + generateFeeds Simplification

**Files:**
- Modify: `src/background.ts`

### Task 1: Add `type` to `Feed` interface

- [ ] **Step 1: Open `src/background.ts` and locate the `Feed` interface at lines 1–7 (includes JSDoc block)**

The current block at lines 1–7:
```ts
/**
 * Interface representing a RSS feed with name and URL
 */
interface Feed {
  name: string; // Display name of the feed
  url: string;  // URL of the feed
}
```

- [ ] **Step 2: Replace the entire block (JSDoc + interface) with the updated version**

```ts
/**
 * Interface representing a RSS feed with name and URL
 */
interface Feed {
  name: string; // Display name of the feed
  url: string;  // URL of the feed
  type: 'user' | 'publication'; // Feed type for display purposes
}
```

- [ ] **Step 3: Verify TypeScript still compiles**

Run: `pnpm dev`
Expected: Build succeeds (TypeScript will now flag `generateFeeds` callers that don't include `type` — that's expected and will be fixed in Task 2).

---

### Task 2: Simplify `generateFeeds` and update call site

- [ ] **Step 1: Locate `generateFeeds` at the bottom of `src/background.ts` (lines 187–213)**

Current signature:
```ts
const generateFeeds = (userFeed: string, mediumPublication: string, publicationDomain: string, tags: string[]) => {
```

- [ ] **Step 2: Replace the entire `generateFeeds` function with the simplified version**

```ts
const generateFeeds = (
  userFeed: string | null,
  mediumPublication: string | null,
  publicationDomain: string | null
): Feed[] => {
  const feeds: Feed[] = []
  if (userFeed) {
    feeds.push({ name: 'User Feed', url: userFeed, type: 'user' })
  }
  if (mediumPublication) {
    feeds.push({ name: 'Publication Feed', url: `medium.com/feed/${mediumPublication}`, type: 'publication' })
  } else if (publicationDomain) {
    feeds.push({ name: 'Publication Feed', url: `${publicationDomain}feed`, type: 'publication' })
  }
  return feeds
}
```

- [ ] **Step 3: Delete the `tags` extraction block (lines ~149–153) in the `chrome.tabs.onUpdated` listener**

Find and delete this block (it currently appears just before the `generateFeeds` call):
```ts
// Extract tags from URLs
const tags = links.map(url => {
  const match = url.match(/tag\/([^/?]+)/);
  return match ? match[1] : null;
}).filter(tag => tag !== null);
```

- [ ] **Step 4: Update the `generateFeeds` call site to remove the `tags` argument**

Find:
```ts
const feeds = generateFeeds(userFeed, mediumPublication, publicationDomain, tags)
```

Replace with:
```ts
const feeds = generateFeeds(userFeed, mediumPublication, publicationDomain)
```

- [ ] **Step 5: Verify build succeeds**

Run: `pnpm dev`
Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/background.ts
git commit -m "feat: simplify generateFeeds to user+publication only, add type field"
```

---

## Chunk 2: popup.css — Theming

**Files:**
- Create: `src/popup.css`

### Task 3: Create `popup.css` with CSS custom properties

- [ ] **Step 1: Create `src/popup.css`**

```css
/* Light mode tokens (default) */
:root {
  --bg: #ffffff;
  --bg-card: #f7f7f7;
  --text-primary: #000000;
  --text-secondary: #555555;
  --border: #e0e0e0;
  --accent: #02b875;
  --btn-bg: #f0f0f0;
  --btn-bg-hover: #e0e0e0;
  --btn-text: #000000;
}

/* Dark mode overrides */
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #1a1a1a;
    --bg-card: #2a2a2a;
    --text-primary: #f0f0f0;
    --text-secondary: #aaaaaa;
    --border: #3a3a3a;
    --accent: #02b875;
    --btn-bg: #3a3a3a;
    --btn-bg-hover: #4a4a4a;
    --btn-text: #f0f0f0;
  }
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  background: var(--bg);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 14px;
  width: 320px;
}

.popup-root {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 80px;
}

/* Header */
.popup-header {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: -0.2px;
}

/* State messages */
.popup-message {
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 0;
}

/* Feed card */
.feed-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.feed-card-type {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.feed-card-url {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: monospace;
}

.feed-card-actions {
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.feed-btn {
  flex: 1;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--btn-bg);
  color: var(--btn-text);
  font-size: 12px;
  cursor: pointer;
  text-align: center;
  text-decoration: none;
  display: inline-block;
  transition: background 0.15s;
}

.feed-btn:hover {
  background: var(--btn-bg-hover);
}

.feed-btn.copied {
  color: var(--accent);
  border-color: var(--accent);
}

/* Footer */
.popup-footer {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.6;
}

.popup-footer a {
  color: var(--accent);
  text-decoration: none;
}

.popup-footer a:hover {
  text-decoration: underline;
}
```

- [ ] **Step 2: Verify file is saved correctly** (no build step needed yet — CSS will be picked up when popup.tsx imports it)

---

## Chunk 3: popup.tsx — Card UI Rewrite

**Files:**
- Modify: `src/popup.tsx`

### Task 4: Rewrite popup.tsx with card layout

- [ ] **Step 1: Replace the entire contents of `src/popup.tsx`**

```tsx
import "./popup.css"
import { useState, useEffect } from "react"

interface Feed {
  name: string
  url: string
  type?: 'user' | 'publication'  // optional for backward compat with stored feeds from prior version
}

const USER_ICON = "👤"
const PUB_ICON = "📰"

function FeedCard({ feed }: { feed: Feed }) {
  const [copied, setCopied] = useState(false)
  const fullUrl = `https://${feed.url}`
  const type = feed.type ?? 'user'
  const icon = type === 'publication' ? PUB_ICON : USER_ICON
  const label = type === 'publication' ? 'Publication Feed' : 'User Feed'
  const inoreaderUrl = `https://www.inoreader.com/search/feeds/${encodeURIComponent(fullUrl)}`

  const handleCopy = () => {
    navigator.clipboard.writeText(fullUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="feed-card">
      <div className="feed-card-type">
        <span>{icon}</span>
        <span>{label}</span>
      </div>
      <div className="feed-card-url" title={fullUrl}>
        {feed.url}
      </div>
      <div className="feed-card-actions">
        <button
          className={`feed-btn${copied ? ' copied' : ''}`}
          onClick={handleCopy}
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
        <a
          className="feed-btn"
          href={inoreaderUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Inoreader
        </a>
      </div>
    </div>
  )
}

function IndexPopup() {
  const [feeds, setFeeds] = useState<Feed[]>([])
  // null = loading, true = Medium article, false = not Medium
  const [isMediumPage, setIsMediumPage] = useState<boolean | null>(null)

  useEffect(() => {
    // Closure-scoped timer — shared between the storage get callback,
    // the storageListener, and the cleanup function.
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (/-[0-9a-z]{10,}$/.test(tab.url)) {
        // URL matches Medium article pattern — check if feeds are already in storage.
        // If feeds are present, transition immediately to the "found" state.
        // If not (background.ts hasn't finished its 1s delay yet), stay in null/loading
        // and let the storageListener below pick up feeds when they arrive.
        chrome.storage.local.get(['feeds'], (result) => {
          if (result.feeds && result.feeds.length > 0) {
            setFeeds(result.feeds)
            setIsMediumPage(true)
          } else {
            // Feeds not yet written — stay in loading state.
            // storageListener will deliver feeds when background.ts writes them.
            // Fallback: if no feeds arrive within 2.5s, show "no feeds found".
            fallbackTimer = setTimeout(() => setIsMediumPage(true), 2500)
          }
        })
      } else {
        setIsMediumPage(false)
        setFeeds([])
      }
    })

    const storageListener = (changes) => {
      if (changes.feeds) {
        const newFeeds = changes.feeds.newValue || []
        setFeeds(newFeeds)
        // Clear the fallback timer — feeds arrived before the timeout
        clearTimeout(fallbackTimer)
        setIsMediumPage(true)
      }
    }

    chrome.storage.onChanged.addListener(storageListener)
    return () => {
      chrome.storage.onChanged.removeListener(storageListener)
      clearTimeout(fallbackTimer)
    }
  }, [])

  const renderBody = () => {
    if (isMediumPage === null) {
      return <p className="popup-message">Loading…</p>
    }
    if (!isMediumPage) {
      return <p className="popup-message">Open a Medium article to discover RSS feeds.</p>
    }
    if (feeds.length === 0) {
      return <p className="popup-message">No RSS feeds found for this article.</p>
    }
    return feeds.map((feed, i) => <FeedCard key={i} feed={feed} />)
  }

  return (
    <div className="popup-root">
      <div className="popup-header">RSS Feeds</div>
      {renderBody()}
      <footer className="popup-footer">
        Follow me on Medium:&nbsp;
        <a href="https://wesley-wei.medium.com/" target="_blank" rel="noopener noreferrer">
          @WesleyWei
        </a>
        <br />
        Feedback:&nbsp;
        <a href="https://t.me/tfrain_w" target="_blank" rel="noopener noreferrer">
          Telegram
        </a>
      </footer>
    </div>
  )
}

export default IndexPopup
```

- [ ] **Step 2: Run dev build and verify no errors**

Run: `pnpm dev`
Expected: Build succeeds, `build/chrome-mv3-dev/` is updated.

- [ ] **Step 3: Load the extension in Chrome and verify all 4 states**

Manual test checklist:
1. Open popup on a **non-Medium page** → shows "Open a Medium article to discover RSS feeds."
2. Open popup on a **Medium article immediately after navigation** (within ~1s of the page loading) → shows "Loading…" until background.ts writes feeds, then transitions to cards
3. Open popup on a **Medium article** after it has fully loaded → shows 1–2 feed cards with correct type icons (👤 User Feed, 📰 Publication Feed)
4. Verify **dark mode**: in Chrome DevTools → Rendering → Emulate CSS media feature `prefers-color-scheme: dark` → popup shows dark background with light text
5. Click **Copy Link** → button shows "Copied!" for ~1.5s, clipboard contains `https://...`
6. Click **Inoreader** → new tab opens to Inoreader search URL
7. **Backward-compat test**: Before updating the extension, navigate to a Medium article so feeds are stored (old format, no `type` field). Then reload the updated extension and open the popup without re-navigating — cards should still render correctly, defaulting to 👤 User Feed label

- [ ] **Step 4: Commit**

```bash
git add src/popup.tsx src/popup.css
git commit -m "feat: redesign popup with card UI, dark mode, and loading state"
```

---

## Chunk 4: Final Verification

### Task 5: End-to-end smoke test + production build

- [ ] **Step 1: Run production build**

Run: `pnpm build`
Expected: Build succeeds, `build/chrome-mv3-prod/` is populated.

- [ ] **Step 2: Test on a known Medium article with a publication**

Open e.g. `https://medium.com/better-programming/...` — expect to see both a User Feed card and a Publication Feed card.

- [ ] **Step 3: Test on a personal Medium article (no publication)**

Open e.g. `https://medium.com/@someuser/article-slug-abc123def456` — expect to see only a User Feed card.

- [ ] **Step 4: Verify badge still updates correctly**

Navigate between articles — badge count should show **1 or 2** (never more), matching the number of feed cards shown in the popup.

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -p
git commit -m "fix: address issues found in smoke test"
```
