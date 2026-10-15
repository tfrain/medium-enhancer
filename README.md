# Medium Enhancer

## Introduction
Medium Enhancer is a browser extension that turns any long-form article page into a faster, more useful reading and clipping tool — AI summaries, one-click export, and RSS discovery, all without leaving the page. It's not limited to Medium: the summary and export work on any article page from the right-click menu.

## Features
- **AI Summary**: Right-click any page and choose "Summarize with AI", or press `Ctrl/Cmd+Shift+S`. Works with a local [Ollama](https://ollama.com) model (free, private, runs on your machine) or your own OpenAI / Anthropic API key (stored only in your browser, sent only to that provider). Optional translation of the result.
- **Markdown Export**: Right-click → "Convert Page to Markdown", or use the popup button. Downloads a `.md` file, or sends it straight to your Obsidian vault (needs the Advanced Obsidian URI plugin).
- **RSS Feed Discovery**: Click the extension icon on a Medium article to find the author's and publication's RSS feeds.
- **Cite My Story** (for Medium writers): While editing a draft, list your own past stories ranked by relevance to the draft title, and copy a link that Medium turns into an embed card.

## Permissions
- Runs on its own only in the Medium editor (Cite My Story). On any other page it runs only when you click the menu, press the shortcut, or use the popup.
- A remote Ollama server (not on your computer) is asked for when you save its address.
- Network requests go only to the page you are on, your Ollama server, or the AI provider you chose.

## Privacy
See [PRIVACY.md](PRIVACY.md). In short: nothing is collected by the developer. If you choose OpenAI or Anthropic, the article text you summarize is sent to that provider with your own API key.

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
```
pnpm install
pnpm dev
```

## License
MIT

## Author
Wesley Wei
