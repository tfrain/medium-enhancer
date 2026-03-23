# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Development build with hot reload (outputs to ./build/chrome-mv3-dev)
pnpm build            # Production build (outputs to ./build/chrome-mv3-prod)
pnpm build -- --zip   # Package as ZIP for distribution
```

No test framework or linter is configured. Prettier is used for formatting (80-char width, 2-space indent, import ordering).

## Architecture

This is a Chrome MV3 extension built with **Plasmo** (wraps Parcel) + React + TypeScript. It enhances Medium articles with an auto-generated Table of Contents (TOC) and RSS feed discovery.

### Entry Points

| File | Role |
|------|------|
| `src/background.ts` | Service worker — detects Medium article URLs, extracts RSS feeds, manages badge, handles keyboard commands |
| `src/contents/index.ts` | Content script — orchestrates TOC lifecycle, observes DOM mutations, routes commands |
| `src/options.tsx` | Settings page (React) |
| `src/popup.tsx` | Extension popup — shows RSS feeds for current article |

### Content Script Internals (`src/contents/`)

- **`toc.ts`** — reactive stream-based engine; manages visibility, scroll tracking, heading state
- **`lib/extract.ts`** — weighted DOM scoring to identify the main article element and extract headings; handles Medium quirks and custom Inoreader selectors
- **`lib/scroll.ts`** — easing-based smooth scroll; identifies scrollable container
- **`ui/index.ts`** — Mithril-rendered TOC panel with drag-to-reposition and active heading highlighting
- **`util/stream.ts`** — custom reactive streams (map, filter, merge, combine, throttle)

### Data Flow

```
background.ts detects Medium URL → extracts RSS feeds → writes to chrome.storage → updates badge
                                                                ↓
contents/index.ts → extractArticle() → extractHeadings() → toc.ts streams → Mithril UI
```

### Key Design Patterns

- **Reactive streams** (`util/stream.ts`) replace direct event listeners throughout the content script
- **Weighted article detection** in `extract.ts`: scores DOM candidates by semantic tags, then re-weights by height, link density, width (filters <400px), and scroll capability
- **RSS feed logic** in `background.ts`: parses article links to generate user feeds (`/feed/@user`), publication feeds, and tag feeds
- Path alias `~/*` → `src/*` (configured in `tsconfig.json`)
