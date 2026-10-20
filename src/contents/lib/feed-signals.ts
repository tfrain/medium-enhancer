// What the background needs to work out a page's RSS feeds. This used to be
// injected by the background on every tab load; running it here means only
// Medium pages, where this content script is registered, ever report.
export type AuthorProfileLink = { href: string; score: number }

export const collectFeedSignals = () => {
  const alternateFeedLinks = Array.from(
    document.querySelectorAll('link[rel="alternate"][type="application/rss+xml"]')
  ).map(el => (el as HTMLLinkElement).href)

  const anchorFeedLinks = Array.from(document.querySelectorAll('a[href*="/feed"]')).map(el => (el as HTMLAnchorElement).href)

  const metaAuthor = (document.querySelector('meta[name="author"]') as HTMLMetaElement | null)?.content?.trim() || ''

  // Author profile links (/@username), scored to prefer the article byline and
  // avoid the logged-in user's top-nav profile link.
  const authorProfileLinks = Array.from(document.querySelectorAll('a[href*="/@"]')).map(el => {
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
  }).filter(Boolean) as AuthorProfileLink[]

  return { alternateFeedLinks, anchorFeedLinks, authorProfileLinks }
}

// Ask the background to refresh feeds and the story menus for this tab.
// Debounced; harmless after an extension reload (the old context just stops).
let reportTimer = 0
export const reportPage = (delay = 0) => {
  if (window.top !== window) return
  window.clearTimeout(reportTimer)
  reportTimer = window.setTimeout(() => {
    try { void chrome.runtime.sendMessage({ type: 'pageReport', signals: collectFeedSignals() }).catch(() => {}) } catch { /* extension reloaded */ }
  }, delay)
}
