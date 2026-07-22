# Medium Enhancer

## Introduction
Medium Enhancer is a browser extension that turns any long-form article page into a faster, more useful reading and clipping tool — AI summaries, one-click export, and RSS discovery, all without leaving the page. It's not limited to Medium: enable it for any site via the configurable site allowlist in Options.

## Features
- **AI Summary**: Summarize the current article, or explain a specific reader comment, from the right-click menu or a floating button. Works with a local [Ollama](https://ollama.com) model (free, fully private, runs on your machine) or your own OpenAI / Anthropic API key (no local install needed — your key is stored only in your browser and talks directly to the provider).
- **Markdown Export**: Turn the current article into clean Markdown from the right-click AI menu.
- **Obsidian Clipper**: Send the current article straight into your Obsidian vault via the Advanced Obsidian URI plugin — one click, no copy-paste.
- **RSS Feed Discovery**: Find and subscribe to RSS feeds for Medium articles, authors, and publications.
- **Keyboard Shortcut**: Trigger AI summarize with `Ctrl/Cmd+Shift+S` — remappable at `chrome://extensions/shortcuts`.

## Installation
1. Install from the Chrome Web Store (link coming soon)
2. Or build from source:
   ```
   pnpm install
   pnpm build
   ```

## Usage
- **Summarize with AI**: Right-click anywhere on the page → "Summarize with AI," or press `Ctrl/Cmd+Shift+S`.
- **Configure AI Provider**: Open the extension Options → AI Provider, and pick Ollama (local) or paste an OpenAI/Anthropic API key.
- **Export to Markdown / Obsidian**: Right-click → the AI menu has both "Copy as Markdown" and "Send to Obsidian" (the latter needs the Obsidian toggle + the Advanced Obsidian URI community plugin installed in Obsidian).
- **Find RSS Feeds**: Click the extension icon on a supported page to see available feeds.

## Development
```
pnpm install
pnpm dev
```

## License
MIT

## Author
Wesley Wei
