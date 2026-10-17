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
    if (/-[0-9a-f]{10,}$/i.test(parts.at(-1) || "")) return "article"
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
