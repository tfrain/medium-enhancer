import { createObsidianAdvancedUri } from "./shared/obsidian-uri"
import { triggerMarkdownDownload } from "./shared/markdown-download"
import { sendToTab } from "./shared/injection"

interface Feed {
  name: string;
  url: string;  // Scheme-less URL (e.g. "medium.com/feed/@user") — popup prepends "https://" at render time
  type: 'user' | 'publication';
}

interface AuthorProfileLink {
  href: string;
  score: number;
}

type SendToObsidianMessage = {
  type: "send-to-obsidian"
  markdown: string
  title: string
  vault?: string
  folder?: string
  filepath?: string
}

const copyMarkdownInTab = async (tabId: number, markdown: string): Promise<boolean> => {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: (markdownText: string) => {
      const textarea = document.createElement("textarea")
      textarea.value = markdownText
      textarea.style.position = "fixed"
      textarea.style.left = "-999999px"
      textarea.style.top = "-999999px"
      document.body.appendChild(textarea)
      textarea.focus()
      textarea.select()

      try {
        return document.execCommand("copy")
      } finally {
        document.body.removeChild(textarea)
      }
    },
    args: [markdown],
  })
  return results?.[0]?.result === true
}

const handleSendToObsidian = async (
  message: SendToObsidianMessage,
  sender: chrome.runtime.MessageSender,
) => {
  const tabId = sender.tab?.id
  if (!tabId) {
    throw new Error("Cannot resolve current tab for Obsidian export.")
  }

  const uriInfo = createObsidianAdvancedUri({
    vault: message.vault || "",
    folder: message.folder || "",
    title: message.title || "Untitled",
    filepath: message.filepath || "",
    markdown: message.markdown || "",
  })

  if (uriInfo.transport === "clipboard") {
    const copied = await copyMarkdownInTab(tabId, message.markdown || "")
    if (!copied) {
      throw new Error("Failed to copy markdown for Obsidian clipboard transport.")
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }

  await chrome.tabs.update(tabId, { url: uriInfo.uri })
  return {
    ok: true,
    transport: uriInfo.transport,
    filepath: uriInfo.filepath,
    length: uriInfo.length,
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "send-to-obsidian") return

  handleSendToObsidian(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error("[obsidian] send failed", error)
      sendResponse({ ok: false, error: error?.message || String(error) })
    })

  return true
})

const getCurrentTab = (): Promise<chrome.tabs.Tab | undefined> =>
  new Promise((resolve) => chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => resolve(tab)))

// The keyboard shortcut and the context menu both count as a user gesture, so
// activeTab lets us inject the content script on any normal page. Pages Chrome
// does not allow (chrome://, the Web Store) fail here and are skipped quietly.
const sendToActiveTab = async (message: unknown) => {
  const tab = await getCurrentTab()
  if (!tab || tab.id == null) return undefined
  try {
    return await sendToTab(tab.id, message)
  } catch (e) {
    console.warn('[bg] cannot run on this page', e)
    return undefined
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'summarize') return
  const { aiSummaryEnabled } = await chrome.storage.local.get({ aiSummaryEnabled: true })
  if (aiSummaryEnabled) sendToActiveTab({ type: 'showSummaryPanel' })
})

chrome.contextMenus.onClicked.addListener(async (item, tab) => {
  if (!tab || tab.id == null) return
  if (item.menuItemId === 'summarize_menu') {
    await sendToTab(tab.id, { type: 'showSummaryPanel' }).catch((e) => console.warn('[bg] cannot run on this page', e))
  }
  if (item.menuItemId === 'clip_markdown_menu') {
    const response: any = await sendToTab(tab.id, { type: 'clipPageAsMarkdown' })
      .catch((e) => { console.warn('[bg] cannot run on this page', e); return undefined })
    if (!response?.ok) {
      if (response) console.error('[bg] clip markdown failed', response.error || 'unknown error')
      return
    }
    // mode 'obsidian' means the content script already sent it to the
    // configured vault folder; only 'download' needs a file save here.
    if (response.mode === 'download') {
      try {
        await triggerMarkdownDownload(response.title, response.markdown)
      } catch (e) {
        console.error('[bg] markdown download failed', e)
      }
    }
  }
})


// Strip the `Origin` header from requests to local Ollama (port 11434) so the
// service doesn't return 403 when OLLAMA_ORIGINS isn't configured.
// Mirrors NativeMindExtension/utils/web-request.ts + public/rules.json.
const OLLAMA_DNR_RULE_ID = 1001;
const ensureOllamaDnrRule = async () => {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [OLLAMA_DNR_RULE_ID],
      addRules: [{
        id: OLLAMA_DNR_RULE_ID,
        priority: 1,
        action: {
          type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
          requestHeaders: [{
            header: 'Origin',
            operation: chrome.declarativeNetRequest.HeaderOperation.REMOVE,
          }],
        },
        condition: {
          regexFilter: '^https?://[^/]*:11434/.*',
          resourceTypes: [chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST],
          initiatorDomains: [chrome.runtime.id],
        },
      }],
    });
  } catch (e) {
    console.error('[bg] failed to install Ollama DNR rule', e);
  }
};

// "Summarize with AI" is shown only while AI Summary is on in Options.
const ensureContextMenus = async () => {
  const { aiSummaryEnabled } = await chrome.storage.local.get({ aiSummaryEnabled: true })
  chrome.contextMenus.removeAll(() => {
    if (aiSummaryEnabled) {
      chrome.contextMenus.create({
        id: "summarize_menu",
        title: "Summarize with AI",
        type: 'normal',
        contexts: ["page", "selection"],
      });
    }
    // Works on any page, and only ever runs when the user clicks it.
    chrome.contextMenus.create({
      id: "clip_markdown_menu",
      title: "Convert Page to Markdown",
      type: 'normal',
      contexts: ["page"],
    });
  });
};

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.aiSummaryEnabled) ensureContextMenus()
})

chrome.runtime.onStartup.addListener(() => {
  ensureContextMenus();
  ensureOllamaDnrRule();
});

chrome.runtime.onInstalled.addListener(async (details) => {
  ensureContextMenus();
  ensureOllamaDnrRule();
  if (details.reason === 'install') {   // not on every update: a new tab each release is a nuisance
    let url = chrome.runtime.getURL("options.html");
    await chrome.tabs.create({ url });
    // Keep the uninstall survey snippet here for possible future reuse,
    // but disable it for now.
    //
    // const feedbackFormId =
    //   '1FAIpQLSdwZSYMRBXmb3BU1lIm7LC5e8OZxYQFg_F2phvvAf0X-zhIDQ';
    // const feedbackFormUrl = `https://docs.google.com/forms/d/e/${feedbackFormId}/viewform`;
    // if (chrome.runtime.setUninstallURL) {
    //   chrome.runtime.setUninstallURL(feedbackFormUrl);
    // }
  }
});


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
    const domain = publicationDomain.replace(/\/$/, '').replace(/\/feed$/i, '')
    feeds.push({ name: 'Publication Feed', url: `${domain}/feed`, type: 'publication' })
  }
  return feeds
}

// Track the last URL per tab to prevent duplicate processing
const lastUrlByTab = new Map<number, string>()

// Treat medium.com and any *.medium.com (e.g. <user>.medium.com publications) as
// known-Medium hosts where it is safe to apply feed-shape fallbacks.
const isMediumHost = (hostname: string) => /(^|\.)medium\.com$/i.test(hostname)

const knownMediumPublicationHosts = new Set([
  'ai.gopubby.com',
  'bettermarketing.pub',
  'itnext.io',
  'pub.towardsai.net',
  'uxdesign.cc',
  'writingcooperative.com',
])

const isKnownMediumPublicationHost = (hostname: string) =>
  knownMediumPublicationHosts.has(String(hostname || '').toLowerCase())

const stripScheme = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '')

const reservedMediumPaths = new Set([
  'about',
  'creators',
  'explore',
  'jobs',
  'm',
  'me',
  'membership',
  'new-story',
  'p',
  'search',
  'signin',
  'tag',
  'topic',
])

const mediumPathParts = (url: string) => {
  try {
    return new URL(url).pathname.split('/').filter(Boolean)
  } catch {
    return []
  }
}

const isMediumArticleUrl = (url: string) => /-[0-9a-z]{10,}(?:[/?#]|$)/i.test(url)

const isLoggedInMediumViewerLink = (url: string) => {
  try {
    const u = new URL(url)
    const source = u.searchParams.get('source') || ''
    return /user_profile|nav|home_header|settings/i.test(source)
  } catch {
    return false
  }
}

const authorFeedFromProfileURL = (url: string): string | null => {
  try {
    const u = new URL(url)
    const match = u.pathname.match(/^\/(@[^/?]+)\/?$/)
    if (!match) return null
    return `${u.hostname}/feed/${match[1]}`
  } catch {
    return null
  }
}

const bestAuthorFeed = (links: AuthorProfileLink[]): string | null => {
  const candidates = links
    .filter((link) => !isLoggedInMediumViewerLink(link.href))
    .map((link) => ({ feed: authorFeedFromProfileURL(link.href), score: link.score }))
    .filter((item): item is { feed: string; score: number } => !!item.feed)
    .sort((a, b) => b.score - a.score)

  return candidates[0]?.feed ?? null
}

const isMediumProfileOrPublicationUrl = (url: string) => {
  try {
    const u = new URL(url)
    if (!isMediumHost(u.hostname)) return false
    const parts = mediumPathParts(url)
    if (parts.length === 1 && parts[0].startsWith('@')) return true
    if (u.hostname !== 'medium.com' && parts.length === 0) return true
    return (
      u.hostname === 'medium.com' &&
      parts.length === 1 &&
      !parts[0].startsWith('@') &&
      !reservedMediumPaths.has(parts[0].toLowerCase())
    )
  } catch {
    return false
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && tab.url !== lastUrlByTab.get(tabId)) {
    lastUrlByTab.set(tabId, tab.url)

    // Reset per-tab state for the new URL. We'll repopulate below if we find
    // legitimate feeds — so non-article pages leave no stale data behind.
    chrome.action.setBadgeText({ text: '', tabId: tabId })
    chrome.storage.local.remove(`feeds_${tabId}`)

    if (!isMediumArticleUrl(tab.url) && !isMediumProfileOrPublicationUrl(tab.url)) return

    setTimeout(() => {
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => {
          const alternateFeedLinks = Array.from(
            document.querySelectorAll('link[rel="alternate"][type="application/rss+xml"]')
          ).map(el => (el as HTMLLinkElement).href)

          const anchorFeedLinks = Array.from(
            document.querySelectorAll('a[href*="/feed"]')
          ).map(el => (el as HTMLAnchorElement).href)

          const metaAuthor = (document.querySelector('meta[name="author"]') as HTMLMetaElement | null)?.content?.trim() || ''

          // Author profile links (/@username), scored to prefer the article
          // byline and avoid the logged-in user's top-nav profile link.
          const authorProfileLinks = Array.from(
            document.querySelectorAll('a[href*="/@"]')
          ).map(el => {
            const anchor = el as HTMLAnchorElement
            let score = 0
            try {
              const u = new URL(anchor.href)
              const source = u.searchParams.get('source') || ''
              const text = (anchor.textContent || anchor.getAttribute('aria-label') || '').trim()
              if (!/^\/@[^/?]+\/?$/.test(u.pathname)) return null
              if (/post_responses|responses|comments/i.test(source)) return null
              if (/post_page|post_header|post_author|byline/i.test(source)) score += 8
              if (anchor.closest('article, main')) score += 3
              if (anchor.closest('header, nav, [role="banner"], [role="navigation"]')) score -= 6
              if (metaAuthor && text && text.toLowerCase().includes(metaAuthor.toLowerCase())) score += 5
              if (/user_profile|nav|home_header|settings/i.test(source)) score -= 10
              return { href: anchor.href, score }
            } catch { return null }
          }).filter(Boolean) as { href: string; score: number }[]

          return { alternateFeedLinks, anchorFeedLinks, authorProfileLinks }
        },
      },
        (results) => {
          if (!results || !results[0] || !results[0].result) return
          const { alternateFeedLinks, anchorFeedLinks, authorProfileLinks } = results[0].result as {
            alternateFeedLinks: string[]
            anchorFeedLinks: string[]
            authorProfileLinks: AuthorProfileLink[]
          }

          const hostname = (() => { try { return new URL(tab.url!).hostname } catch { return '' } })()
          const mediumHost = isMediumHost(hostname)
          const knownMediumPublicationHost = isKnownMediumPublicationHost(hostname)

          let feeds: Feed[] = []

          if (mediumHost || knownMediumPublicationHost) {
            // Known Medium host — safe to run the full feed-detection logic including
            // fabrication fallbacks (author feed from /@byline, publication from URL path).
            const links = [...new Set([...alternateFeedLinks, ...anchorFeedLinks])]
            const alternateLinks = [...new Set(alternateFeedLinks)]
            const standardUserFeedLink = alternateLinks.find((l) => l.includes('/feed/@'))
            const customUserFeedLink = alternateLinks.find((l) => /\/\/[^/.]+\.medium\.com\/feed(?:\/|\?|$)/.test(l))
            const userFeedLink = standardUserFeedLink ?? customUserFeedLink ?? null

            const pubFeedLink = links.find(
              (l) =>
                l !== userFeedLink &&
                ((l.includes('/feed/') && !l.includes('/feed/@')) ||
                  /\/\/medium\.[^.]+\.[^/]+\/feed(?:\/|\?|$)/.test(l))
            )

            const userPath = userFeedLink?.match(/\/\/([^?]+)/)?.[1] ?? null
            const pubPath = pubFeedLink?.match(/\/\/([^?]+)/)?.[1] ?? null

            const authorFeed = !userPath ? bestAuthorFeed(authorProfileLinks) : null

            const urlParts = mediumPathParts(tab.url!)
            const authorFromUrl = urlParts[0]?.startsWith('@')
              ? `medium.com/feed/${urlParts[0]}`
              : mediumHost && hostname !== 'medium.com' && urlParts.length === 0
                ? `${hostname}/feed`
                : null

            const userFeed = userPath
              ? userPath.includes('/feed') ? userPath : userPath.replace(/\/?$/, '/feed')
              : authorFeed ?? authorFromUrl

            const publicationFromUrl =
              hostname === 'medium.com' &&
              urlParts[0] &&
              !urlParts[0].startsWith('@') &&
              !reservedMediumPaths.has(urlParts[0].toLowerCase())
                ? urlParts[0] : null

            const mediumPublication =
              pubPath?.match(/medium\.com\/feed\/([^/?]+)/)?.[1] ?? publicationFromUrl ?? null
            const publicationDomain =
              knownMediumPublicationHost ? hostname :
                !mediumPublication && pubPath ? pubPath : null

            feeds = generateFeeds(userFeed, mediumPublication, publicationDomain)
          } else {
            // Non-Medium host. DO NOT fabricate feeds. Only trust explicit
            // <link rel="alternate" type="application/rss+xml"> declarations.
            const seen = new Set<string>()
            for (const href of alternateFeedLinks) {
              const clean = stripScheme(href)
              if (!clean || seen.has(clean)) continue
              seen.add(clean)
              feeds.push({ name: 'RSS Feed', url: clean, type: 'publication' })
            }
          }

          if (feeds.length > 0) {
            chrome.action.setBadgeText({ text: feeds.length.toString(), tabId: tabId })
            chrome.action.setBadgeBackgroundColor({ color: '#070707', tabId: tabId })
            chrome.storage.local.set({ [`feeds_${tabId}`]: feeds })
          }
        }
      )
    }, 1000)
  }
});

// Clean up per-tab state when a tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  lastUrlByTab.delete(tabId)
  chrome.storage.local.remove(`feeds_${tabId}`)
})

// AI chat via Ollama (streaming over runtime Port)
const MAX_ARTICLE_CHARS = 12000

const buildPrompt = (instruction: string, title: string, text: string, context?: string) => {
  const truncated = text.length > MAX_ARTICLE_CHARS
    ? text.slice(0, MAX_ARTICLE_CHARS) + '\n\n[...truncated...]'
    : text
  const contextBlock = context && context.trim()
    ? `\n\nSelected Comment / Reader Viewpoint:\n${context.trim()}`
    : ''
  return `${instruction}

Title: ${title}
${contextBlock}

Article:
${truncated}`
}

type SummarizeMsg = {
  instruction: string
  title: string
  text: string
  context?: string
  baseUrl: string
  model: string
  provider?: 'ollama' | 'openai' | 'anthropic'
  apiKey?: string
}

// Parse a single SSE `data: {...}` line into the delta text for the given
// cloud provider's streaming chat format. Returns null for lines that carry
// no text (e.g. the `[DONE]` sentinel or a role-only OpenAI delta).
const extractCloudDelta = (provider: 'openai' | 'anthropic', line: string): { text?: string; done?: boolean; error?: string } | null => {
  if (!line.startsWith('data:')) return null
  const data = line.slice(5).trim()
  if (data === '[DONE]') return { done: true }
  let json: any
  try {
    json = JSON.parse(data)
  } catch {
    return null
  }
  if (provider === 'openai') {
    if (json.error) return { error: json.error.message || String(json.error) }
    const delta = json?.choices?.[0]?.delta?.content
    return delta ? { text: delta } : null
  }
  // anthropic: content_block_delta carries { delta: { type: 'text_delta', text } }
  if (json.type === 'error') return { error: json.error?.message || 'Anthropic API error' }
  if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta') {
    return { text: json.delta.text as string }
  }
  if (json.type === 'message_stop') return { done: true }
  return null
}

const runCloudStream = async (
  port: chrome.runtime.Port,
  abortController: AbortController,
  provider: 'openai' | 'anthropic',
  apiKey: string,
  model: string,
  prompt: string,
) => {
  const url = provider === 'openai'
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.anthropic.com/v1/messages'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  let body: Record<string, unknown>
  if (provider === 'openai') {
    headers['Authorization'] = `Bearer ${apiKey}`
    body = { model, messages: [{ role: 'user', content: prompt }], stream: true }
  } else {
    headers['x-api-key'] = apiKey
    headers['anthropic-version'] = '2023-06-01'
    body = { model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }], stream: true }
  }
  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: abortController.signal })
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '')
    port.postMessage({ type: 'error', error: `${provider} HTTP ${res.status}: ${errText || res.statusText}` })
    try { port.disconnect() } catch {}
    return
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim()
      buffer = buffer.slice(idx + 1)
      if (!line) continue
      const parsed = extractCloudDelta(provider, line)
      if (!parsed) continue
      if (parsed.error) {
        port.postMessage({ type: 'error', error: parsed.error })
        try { port.disconnect() } catch {}
        return
      }
      if (parsed.text) port.postMessage({ type: 'chunk', chunk: parsed.text })
      if (parsed.done) {
        port.postMessage({ type: 'done' })
        try { port.disconnect() } catch {}
        return
      }
    }
  }
  port.postMessage({ type: 'done' })
  try { port.disconnect() } catch {}
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'summarize') return

  const abortController = new AbortController()
  let closed = false
  port.onDisconnect.addListener(() => {
    closed = true
    abortController.abort()
  })

  port.onMessage.addListener(async (msg: SummarizeMsg) => {
    const { instruction, title, text, context, baseUrl, model, provider = 'ollama', apiKey } = msg
    if (!text || !text.trim()) {
      port.postMessage({ type: 'error', error: 'No article text found on this page.' })
      try { port.disconnect() } catch {}
      return
    }
    if (!instruction || !instruction.trim()) {
      port.postMessage({ type: 'error', error: 'No instruction provided.' })
      try { port.disconnect() } catch {}
      return
    }

    // Cloud providers (BYOK): user supplies their own API key, zero cost to us,
    // and it works without a local Ollama install — see options.tsx "AI Provider".
    if (provider === 'openai' || provider === 'anthropic') {
      if (!apiKey || !apiKey.trim()) {
        port.postMessage({ type: 'error', error: `No API key configured for ${provider}. Add one in the extension options.` })
        try { port.disconnect() } catch {}
        return
      }
      try {
        await runCloudStream(port, abortController, provider, apiKey.trim(), model, buildPrompt(instruction, title, text, context))
      } catch (e: any) {
        if (closed || e?.name === 'AbortError') return
        port.postMessage({ type: 'error', error: e?.message || 'Request failed' })
        try { port.disconnect() } catch {}
      }
      return
    }

    const url = baseUrl.replace(/\/$/, '') + '/api/generate'
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: buildPrompt(instruction, title, text, context),
          stream: true,
        }),
        signal: abortController.signal,
      })
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        port.postMessage({ type: 'error', error: `Ollama HTTP ${res.status}: ${errText || res.statusText}` })
        try { port.disconnect() } catch {}
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (!closed) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let idx: number
        while ((idx = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, idx).trim()
          buffer = buffer.slice(idx + 1)
          if (!line) continue
          try {
            const json = JSON.parse(line)
            if (json.response) {
              port.postMessage({ type: 'chunk', chunk: json.response })
            }
            if (json.done) {
              port.postMessage({ type: 'done' })
              try { port.disconnect() } catch {}
              return
            }
            if (json.error) {
              port.postMessage({ type: 'error', error: String(json.error) })
              try { port.disconnect() } catch {}
              return
            }
          } catch {
            // skip malformed line
          }
        }
      }
      port.postMessage({ type: 'done' })
      try { port.disconnect() } catch {}
    } catch (e: any) {
      if (closed || e?.name === 'AbortError') return
      const hint = /Failed to fetch|NetworkError/i.test(e?.message || '')
        ? ' — is Ollama running at ' + baseUrl + '?'
        : ''
      port.postMessage({ type: 'error', error: (e?.message || 'Request failed') + hint })
      try { port.disconnect() } catch {}
    }
  })
})
