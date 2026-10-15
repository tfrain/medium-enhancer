# Medium Enhancer: Privacy Policy

Last updated: 16 October 2026

Medium Enhancer is a Chrome extension that summarizes articles with AI, exports them as Markdown or to Obsidian, finds RSS feeds, and helps Medium writers link their own past stories.

## What the extension reads

- **The page you are on**, only when you ask for a summary or a Markdown export. It reads the article text and title.
- **Your own Medium stories**, only in the "Cite My Story" panel while you edit a draft, using the Medium session you are already signed in with.

## Where data goes

- **Ollama (default)**: the article text is sent to the Ollama server you configured, normally on your own computer. It does not leave your machine unless you point the extension at another one.
- **OpenAI or Anthropic (only if you choose them)**: the article text is sent to that provider's API with your own API key, under that provider's privacy policy. The extension sends nothing to the developer.
- **Obsidian**: exported Markdown is handed to your local Obsidian app.

## What the extension stores

Your settings (AI provider, model, API key, Obsidian vault) and found RSS feeds are kept in Chrome's local extension storage on your device. Your API key is stored only there and is sent only to the provider it belongs to.

## What the extension does not do

- It does not send any data to the developer or to any party you did not choose.
- It does not use analytics, tracking or advertising.
- It does not read or store your passwords, cookies or session tokens.
- It does not sell or share data.

## Contact

Questions: open an issue at https://github.com/tfrain/medium-enhancer/issues
