# Medium Enhancer

## Introduction
Medium Enhancer is a browser extension that turns any long-form article page into a faster, more useful reading and clipping tool — AI summaries, one-click export, and RSS discovery, all without leaving the page. It's not limited to Medium: the summary and export work on any article page from the right-click menu.

## Features
- **AI Summary**: Right-click any page and choose "Summarize with AI", or press `Ctrl/Cmd+Shift+S`. Works with a local [Ollama](https://ollama.com) model (free, private, runs on your machine) or your own OpenAI / Anthropic API key (stored only in your browser, sent only to that provider). Optional translation of the result.
- **Markdown Export**: Right-click → "Convert Page to Markdown", or use the popup button. Downloads a `.md` file, or sends it straight to your Obsidian vault (needs the Advanced Obsidian URI plugin).
- **RSS Feed Discovery**: Click the extension icon on a Medium article to find the author's and publication's RSS feeds.
- **Quote cards / Pro**: Turn a story selection into a PNG with author and story attribution. Cards are generated locally in the browser with no network request. Pro adds styles, sizes, and watermark removal.
  Hover a paragraph to see the card icon; selection still works for part of a paragraph. The hover icon can be turned off in Options.
- **Bookshelf**: An unlimited local read-later queue, with Pro Markdown archives, private highlights/notes, full-text search and ZIP/Obsidian export.
- **Cite My Story** (for Medium writers): While editing a draft, list your own past stories ranked by relevance to the draft title, and copy a link that Medium turns into an embed card.

## Bookshelf

Your library lives in your browser and your files; there is no server to shut down.

- **Free:** unlimited save-for-later queue on supported Medium stories. Use **Save to Bookshelf** in the popup or right-click menu. Open Bookshelf from the popup or Options; filter Unread/Read/All, mark stories read or unread, open stories, and delete with a brief Undo window. Free saves store metadata only.
- **Pro:** saving also archives the rendered article as Markdown. **Archive now** in the popup can archive an existing save; from Bookshelf it requires that story to be open in another tab. No story is fetched in the background. Right-click a selection on a saved story → **Highlight to Bookshelf**, then edit private notes in Bookshelf. Search title, author, archived text, highlights and notes locally. **Export all (.zip)** creates portable Markdown files with metadata and highlights; per-story **Export to Obsidian** uses the existing clipper when enabled in Options.
- Turn **Bookshelf** off in Options to stop capture. Existing library data remains available to manage. If Pro expires, the queue remains usable and Pro content stays stored for a future unlock.

Bookshelf data stays in this browser profile's extension-owned IndexedDB. It does not sync or contact a server. `unlimitedStorage` removes Chrome's usual storage quota/eviction limits for local archives; available disk space still matters. **Export is your backup. Uninstalling the extension deletes your Bookshelf.** Keep exported files somewhere safe. ZIP backup/export is a Pro feature; this version does not import ZIP backups.

## Permissions
- `unlimitedStorage` keeps Bookshelf archives in extension-owned IndexedDB without the usual quota and automatic storage eviction. No new host access is required.
- Runs automatically on supported Medium hosts for quote cards in stories and Cite My Story in the editor. On other hosts, summary, Markdown export, and RSS discovery run only when you click the menu, press the shortcut, or use the popup.
- A remote Ollama server (not on your computer) is asked for when you save its address.
- Network requests go only to the page you are on, your Ollama server, or the AI provider you chose.

## Privacy
See [PRIVACY.md](PRIVACY.md). In short: nothing is collected by the developer. If you choose OpenAI or Anthropic, the article text you summarize is sent to that provider with your own API key.

The Pro key is stored in `chrome.storage.local` and `chrome.storage.sync`. When Chrome sync is on, it follows your Chrome profile to other devices.

Feedback and questions go to the comments of the [release article](https://medium.com/programmers-career/display-medium-toc-and-rss-feeds-medium-enhancer-f06012a2780c).

## Installation
1. Install from the Chrome Web Store (link coming soon)
2. Or build from source:
   ```
   pnpm install
   pnpm build
   ```

## Usage
- **Summarize**: right-click → "Summarize with AI", or `Ctrl/Cmd+Shift+S` (change it at `chrome://extensions/shortcuts`).
- **Choose an AI provider**: Options → AI: Ollama (local), or paste an OpenAI / Anthropic key.
- **Export**: right-click → "Convert Page to Markdown". Turn on "Save to Obsidian" in Options to send it to your vault instead.
- **RSS**: click the extension icon on a Medium article.

## Development

Run unit tests with Node 26: `node --experimental-strip-types --no-warnings test/<name>.test.ts` (run each `test/*.test.ts`). The offline Bookshelf browser harness is `test/bookshelf.browser.mjs`; it needs the same locally available `puppeteer-core` and Chromium as `test/quote-card.browser.mjs`, plus a production build. It copies the build to a temporary directory and injects only a generated test-key hash there; source Pro keys are never changed. Browser tests are a separate, manual step.

```
pnpm install
pnpm dev
```

## License
MIT

## Author
Wesley Wei
