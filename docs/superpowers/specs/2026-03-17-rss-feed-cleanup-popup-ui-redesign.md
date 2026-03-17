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

> **Backward compatibility**: Feeds written by a prior version of the extension will be missing the `type` field. `popup.tsx` must defensively handle this by treating a missing `type` as `'user'` (fallback). No storage migration needed.

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

**Call site update**: The call site on line 154 of `background.ts` currently passes `tags` as the 4th argument — `generateFeeds(userFeed, mediumPublication, publicationDomain, tags)`. This must be updated to the 3-argument form. Additionally, the tag-extraction block (currently lines 149–153) that builds the `tags` array must also be deleted, as it will no longer be used.

> **URL scheme convention**: Feed URLs are stored without a scheme (e.g. `medium.com/feed/@user`). The popup prepends `https://` at render time. Do not add a scheme in `generateFeeds`.

**Result**: Max 2 feeds, both derived from links that directly reference the article — much higher likelihood of being valid.

---

## Section 2: Popup UI Redesign (`popup.tsx`)

### Layout

- Width: **320px** (down from 600px)
- Font size: **14px** base (down from 20px)
- Padding: **16px**

### Styling Mechanism

Use a co-located `popup.css` file (placed next to `popup.tsx`). Plasmo automatically injects co-located CSS files into the popup. Use CSS custom properties with `@media (prefers-color-scheme: dark)` overrides in that file. This is the idiomatic Plasmo approach and avoids `dangerouslySetInnerHTML` or `useEffect`-based head injection.

### States

| State | Display |
|-------|---------|
| Loading (background delay) | Subtle "Loading…" text — avoids false "no feeds" flash during the 1s background script delay |
| Not a Medium article | Icon + "Open a Medium article to discover RSS feeds." |
| Medium article, feeds found | Card list (1–2 cards) |
| Medium article, no feeds | "No RSS feeds found for this article." |

> **Loading state rationale**: `background.ts` has a 1000 ms `setTimeout` before writing feeds to storage. If the popup is opened within that window, `feeds` will be empty and `isMediumPage` may not yet be set. A loading state (shown until the storage read completes) prevents a false "no feeds found" flash. Use `null` as the initial value for `isMediumPage` (`null | true | false`) to represent the loading state — `null` maps to the Loading display, `true` to the feed cards or no-feeds message, `false` to the non-Medium-article message.

### Feed Card (per feed)

```
┌─────────────────────────────────────┐
│ 👤 User Feed          (type label)  │
│ medium.com/feed/@username           │
│ ─────────────────────────────────── │
│ [Copy Link]   [Subscribe in Inoreader] │
└─────────────────────────────────────┘
```

- **Type label**: `User Feed` (person icon) or `Publication Feed` (newspaper icon); falls back to `User Feed` if `type` is missing (backward compat)
- **URL**: truncated with `overflow: hidden; text-overflow: ellipsis`, full URL shown on hover (`title` attr)
- **Copy Link**: copies `https://{feed.url}` to clipboard, button text briefly changes to "Copied!" for 1.5s
- **Subscribe in Inoreader**: opens Inoreader search URL in new tab (existing behavior)

### Dark / Light Mode

CSS custom properties defined in `popup.css`, overridden in `@media (prefers-color-scheme: dark)`:

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
| `src/background.ts` | Remove tag feed logic + `tags` extraction block + `tags` call-site arg; add `type` to `Feed` interface |
| `src/popup.tsx` | Full UI rewrite: card layout, loading state, dark/light mode, copy button |
| `src/popup.css` | New file: CSS custom properties and `prefers-color-scheme` dark overrides |

## Out of Scope

- Feed URL validation (HEAD requests) — CORS/CSP risks outweigh benefit
- Tag feeds — removed entirely
- Any changes to TOC or content script behavior
