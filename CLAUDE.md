# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read `AGENTS.md` first** — update-latency, privacy, testing and release rules learned the hard way.

## Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Development build with hot reload (outputs to ./build/chrome-mv3-dev)
pnpm build            # Production build (outputs to ./build/chrome-mv3-prod)
pnpm build -- --zip   # Package as ZIP for distribution
```

Tests: unit tests in `test/*.test.ts` and two local browser harnesses (`test/*.browser.mjs`); see `AGENTS.md` §4 for how to run them. Prettier is used for formatting (80-char width, 2-space indent, import ordering).

## Release Rule

For any user-visible extension behavior change, bump the version in `package.json` before building. After the change, run `pnpm build` so the reloaded browser extension can be identified as the new code path.

## Architecture

This is a Chrome MV3 extension built with **Plasmo** (wraps Parcel) + React + TypeScript. It enhances Medium (and any allowlisted site) with AI summaries, Markdown/Obsidian export, and RSS feed discovery.

### Entry Points

| File | Role |
|------|------|
| `src/background.ts` | Service worker — computes RSS feeds from the content script's `pageReport`, manages badge and context menus, handles keyboard commands, Bookshelf messages, and the AI streaming fetch (Ollama/OpenAI/Anthropic). No browser-wide tab/window listeners (AGENTS.md §1) |
| `src/contents/index.ts` | Content script — routes the AI-summary message, mounts/unmounts the floating summary ball per site-allowlist + capability toggles |
| `src/contents/ai-menu.ts` | Right-click AI menu (summarize, explain comment, copy as Markdown, send to Obsidian) |
| `src/contents/summary-ball.ts` / `summary-panel.ts` | Floating AI button + summary panel UI |
| `src/options.tsx` | Settings page (React) |
| `src/popup.tsx` | Extension popup — shows RSS feeds for current article |

### Content Script Internals (`src/contents/`)

- **`lib/extract.ts`** — weighted DOM scoring to identify the main article element (`extractArticle`) and its clean text for AI prompts (`extractArticleTextForAI`); handles Medium quirks and custom Inoreader selectors
- **`lib/iframe.ts`** — resolves the top content window so content scripts don't double-run in iframes
- **`markdown/`** — Medium DOM → clean Markdown conversion for export/Obsidian

### Key Design Patterns

- **Weighted article detection** in `extract.ts`: scores DOM candidates by semantic tags, then re-weights by height, link density, width (filters <400px), and scroll capability
- **RSS feed logic**: the content script collects feed links (`src/contents/lib/feed-signals.ts`) and reports them; `background.ts` turns them into user/publication feeds and stores them per tab in `storage.session`
- **BYOK AI**: `background.ts` proxies streaming chat requests to a local Ollama instance or the user's own OpenAI/Anthropic key (stored only in `chrome.storage.local`)
- Path alias `~/*` → `src/*` (configured in `tsconfig.json`)
