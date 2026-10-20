# Medium Enhancer: Privacy Policy

Last updated: 20 October 2026

Medium Enhancer is a Chrome extension that summarizes articles with AI, exports them as Markdown or to Obsidian, finds RSS feeds, and helps Medium writers link their own past stories.

## What the extension reads

- **The page you are on**, only when you ask for a summary or a Markdown export. It reads the article text and title.
- **Story selections for quote cards**, on supported Medium story pages. Quote cards are generated locally in the browser with no network request.
- **Your own Medium stories**, only in the "Cite My Story" panel while you edit a draft, using the Medium session you are already signed in with.

## Where data goes

- **Ollama (default)**: the article text is sent to the Ollama server you configured, normally on your own computer. It does not leave your machine unless you point the extension at another one.
- **OpenAI or Anthropic (only if you choose them)**: the article text is sent to that provider's API with your own API key, under that provider's privacy policy. The extension sends nothing to the developer.
- **Obsidian**: exported Markdown is handed to your local Obsidian app.

## What the extension stores

Your settings (AI provider, model, API key, Obsidian vault) and found RSS feeds are kept in Chrome's local extension storage on your device. Your API key is stored only there and is sent only to the provider it belongs to.

The Pro key is stored in `chrome.storage.local` and `chrome.storage.sync`. When Chrome sync is on, the key follows your Chrome profile to other devices. Pro validation happens locally.

## Bookshelf: local library and backups

Bookshelf saves a story's canonical URL, post ID, title, author, publication, subtitle, saved/read dates and tags in **IndexedDB owned by the extension origin**, not the website. Free saves are metadata-only. Pro can also save the article Markdown rendered in your own open page, its word count and capture date, and your selected highlights and private notes. Capture runs only when you ask. It never fetches another story or sends library content to a server. Search runs locally. Bookshelf does not sync across devices.

`unlimitedStorage` allows local archives to exceed the normal Chrome storage quota and prevents automatic quota-based eviction. It does not provide online storage or access to additional websites. Storage failures (for example, a full disk) are reported to you.

**Export is your backup. Uninstalling the extension deletes your Bookshelf, including archives, highlights and notes.** Keep exported Markdown ZIP files somewhere safe. ZIP export is a Pro feature. Optional Obsidian export hands the selected story and its highlights/notes to your local Obsidian app, using the clipboard for large notes. Disabling Bookshelf or letting Pro expire preserves stored data; deleting a story removes its archive and highlights, with a brief undo window.

## What the extension does not do

- It does not send any data to the developer or to any party you did not choose.
- It does not use analytics, tracking or advertising.
- It does not read or store your passwords, cookies or session tokens.
- It does not sell or share data.

## Contact

Feedback and questions go to the comments of the [release article](https://medium.com/programmers-career/display-medium-toc-and-rss-feeds-medium-enhancer-f06012a2780c).
