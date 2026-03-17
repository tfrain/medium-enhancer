# RSS Feed Cleanup + Popup UI Redesign

**Date:** 2026-03-17
**Status:** Approved

## Problem

1. **Too many invalid RSS feeds**: `generateFeeds` in `background.ts` generates tag-based feeds (e.g. `medium.com/feed/publication/tagged/tag`) which frequently don't exist, cluttering the popup with broken links.
2. **Poor popup UI**: The current popup is a bare `<ul><li><a>` list at 600px wide with 20px font — no visual hierarchy, no copy affordance, no dark mode support.

## Solution Overview

**Approach 1 — Frontend filter + card UI** (chosen): Remove tag feed generation at the source; redesign popup with card-based layout and system dark/light mode support.

---

## Section 1: RSS Backend Changes (`background.ts`)

### Feed Type

Add a `type` discriminator to the `Feed` interface:

```ts
interface Feed {
  name: string;
  url: string;
  type: 'user' | 'publication';
}
```

### `generateFeeds` Simplification

Remove all tag feed logic. Only generate at most 2 feeds:

1. **user feed** — from `userFeed` path (e.g. `medium.com/feed/@user` or `username.medium.com/feed`)
2. **publication feed** — from `mediumPublication` or `publicationDomain`

```ts
const generateFeeds = (
  userFeed: string | null,
  mediumPublication: string | null,
  publicationDomain: string | null
): Feed[] => {
  const feeds: Feed[] = [];
  if (userFeed) {
    feeds.push({ name: 'User Feed', url: userFeed, type: 'user' });
  }
  if (mediumPublication) {
    feeds.push({ name: 'Publication Feed', url: `medium.com/feed/${mediumPublication}`, type: 'publication' });
  } else if (publicationDomain) {
    feeds.push({ name: 'Publication Feed', url: `${publicationDomain}feed`, type: 'publication' });
  }
  return feeds;
};
```

**Result**: Max 2 feeds, both derived from links that directly reference the article — much higher likelihood of being valid.

---

## Section 2: Popup UI Redesign (`popup.tsx`)

### Layout

- Width: **320px** (down from 600px)
- Font size: **14px** base (down from 20px)
- Padding: **16px**

### States

| State | Display |
|-------|---------|
| Not a Medium article | Icon + "Open a Medium article to discover RSS feeds." |
| Medium article, feeds found | Card list (1–2 cards) |
| Medium article, no feeds | "No RSS feeds found for this article." |

### Feed Card (per feed)

```
┌─────────────────────────────────────┐
│ 👤 User Feed          (type label)  │
│ medium.com/feed/@username           │
│ ─────────────────────────────────── │
│ [Copy Link]   [Subscribe in Inoreader] │
└─────────────────────────────────────┘
```

- **Type label**: `User Feed` (person icon) or `Publication Feed` (newspaper icon)
- **URL**: truncated with ellipsis if too long, full URL shown on hover (`title` attr)
- **Copy Link**: copies `https://{feed.url}` to clipboard, button text briefly changes to "Copied!"
- **Subscribe in Inoreader**: opens Inoreader search URL in new tab (existing behavior)

### Dark / Light Mode

Controlled via CSS `prefers-color-scheme`. Use inline `<style>` tag injected into the popup head, or a `<style>` block in the component.

| Token | Light | Dark |
|-------|-------|------|
| `--bg` | `#ffffff` | `#1a1a1a` |
| `--bg-card` | `#f7f7f7` | `#2a2a2a` |
| `--text-primary` | `#000000` | `#f0f0f0` |
| `--text-secondary` | `#555555` | `#aaaaaa` |
| `--border` | `#e0e0e0` | `#3a3a3a` |
| `--accent` | `#02b875` | `#02b875` |

### Footer

Keep author info but shrink: 11px font, muted color (`--text-secondary`), minimal top border separator.

---

## Files Changed

| File | Change |
|------|--------|
| `src/background.ts` | Remove tag feed logic from `generateFeeds`; add `type` to `Feed` interface |
| `src/popup.tsx` | Full UI rewrite: card layout, dark/light mode, copy button |

## Out of Scope

- Feed URL validation (HEAD requests) — CORS/CSP risks outweigh benefit
- Tag feeds — removed entirely
- Any changes to TOC or content script behavior
