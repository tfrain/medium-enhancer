export const isMediumHost = (hostname: string): boolean =>
  /(^|\.)medium\.com$/i.test(hostname)

const knownMediumPublicationHosts = new Set([
  "ai.gopubby.com",
  "bettermarketing.pub",
  "itnext.io",
  "pub.towardsai.net",
  "uxdesign.cc",
  "writingcooperative.com"
])
export const mediumStoryDocumentPatterns = [
  'https://*.medium.com/*',
  ...Array.from(knownMediumPublicationHosts, host => `https://${host}/*`),
]
export const isKnownMediumPublicationHost = (hostname: string): boolean =>
  knownMediumPublicationHosts.has(hostname.toLowerCase())

export const reservedMediumPaths = new Set([
  "about",
  "creators",
  "explore",
  "jobs",
  "m",
  "me",
  "membership",
  "new-story",
  "p",
  "search",
  "signin",
  "tag",
  "topic"
])

export const mediumPathParts = (url: string): string[] => {
  try {
    return new URL(url).pathname.split("/").filter(Boolean)
  } catch {
    return []
  }
}

export const mediumPostId = (url: string): string | null => {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol) || (!isMediumHost(u.hostname) && !isKnownMediumPublicationHost(u.hostname))) return null
    const short = u.pathname.match(/^\/p\/([0-9a-f]{12})\/?$/i)
    if (short) return short[1].toLowerCase()
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length > 2 || parts.at(-1)?.startsWith('@') || reservedMediumPaths.has((parts[0] || '').toLowerCase())) return null
    const slug = u.pathname.match(/-([0-9a-f]{12})\/?$/i)
    return slug?.[1].toLowerCase() ?? null
  } catch { return null }
}

export const buildParagraphLink = (canonicalUrl: string, paragraphId: string): string => {
  const postId = mediumPostId(canonicalUrl)
  return postId && /^[0-9a-f]{4}$/.test(paragraphId)
    ? `https://medium.com/p/${postId}#${paragraphId}`
    : canonicalUrl
}

export const classifyMediumUrl = (
  url: string
): "article" | "profile" | "publication" | null => {
  try {
    const u = new URL(url)
    if (!/^https?:$/.test(u.protocol)) return null
    const medium = isMediumHost(u.hostname)
    const publication = isKnownMediumPublicationHost(u.hostname)
    if (!medium && !publication) return null
    const parts = mediumPathParts(url)
    if (mediumPostId(url) || /-[0-9a-f]{10,}$/i.test(parts.at(-1) || "")) return "article"
    if (medium && parts.length === 1 && parts[0].startsWith("@"))
      return "profile"
    if (u.hostname !== "medium.com" && parts.length === 0) return "publication"
    if (
      u.hostname === "medium.com" &&
      parts.length === 1 &&
      !reservedMediumPaths.has(parts[0].toLowerCase())
    )
      return "publication"
    return null
  } catch {
    return null
  }
}
