// Self-contained so activeTab callers can run it through executeScript.
export const inspectMediumPage = () => {
  const siteName = document.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content?.trim() || ''
  const appLink = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[property^="al:"]'))
    .some(meta => /^medium:\/\//i.test(meta.content || ''))
  let mediumCanonical = false
  try {
    const canonical = new URL(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || '')
    mediumCanonical = /^https?:$/.test(canonical.protocol) && /(^|\.)medium\.com$/i.test(canonical.hostname) &&
      /(?:\/p\/|-)[0-9a-f]{12}\/?$/i.test(canonical.pathname)
  } catch {}
  const isMediumStory = !!document.querySelector('article') && (appLink || /^medium$/i.test(siteName) || mediumCanonical)
  const feeds = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"][type="application/rss+xml"]'))
    .map(link => link.href)
    .filter(href => /^https?:\/\//i.test(href))
  if (isMediumStory && feeds.length === 0) {
    feeds.push(`${location.origin}/feed`)
    for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      try {
        const url = new URL(link.href)
        const handle = url.pathname.match(/^\/@([A-Za-z0-9_.-]+)(?:\/|$)/)?.[1]
        if (url.protocol === 'https:' && url.hostname === 'medium.com' && handle) {
          feeds.push(`https://medium.com/feed/@${handle}`)
          break
        }
      } catch {}
    }
  }
  return { isMediumStory, feeds: isMediumStory ? [...new Set(feeds)] : [] }
}
