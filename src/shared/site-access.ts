export const DEFAULT_SITE_ALLOWLIST = [
  'medium.com',
  '*.medium.com',
  'inoreader.com',
  '*.inoreader.com',
  'innoreader.com',
  '*.innoreader.com',
  'itnext.io',
  '*.itnext.io',
  'uxdesign.cc',
  '*.uxdesign.cc',
  'ai.gopubby.com',
  '*.gopubby.com',
  'pub.towardsai.net',
  '*.towardsai.net',
  'bettermarketing.pub',
  '*.bettermarketing.pub',
  'writingcooperative.com',
  '*.writingcooperative.com',
]

export const parseSiteAllowlist = (value: string | string[] | undefined): string[] => {
  const raw = Array.isArray(value) ? value.join('\n') : String(value || '')
  return raw
    .split(/[\n,]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export const serializeSiteAllowlist = (items: string[]): string =>
  items.map((item) => item.trim()).filter(Boolean).join('\n')

export const mergeDefaultSiteAllowlist = (items: string[] | undefined): string[] => {
  const seen = new Set<string>()
  const merged: string[] = []

  for (const item of [...parseSiteAllowlist(items || []), ...DEFAULT_SITE_ALLOWLIST]) {
    if (seen.has(item)) continue
    seen.add(item)
    merged.push(item)
  }

  return merged
}

export const isHostAllowed = (hostname: string, allowlist: string[]): boolean => {
  const host = String(hostname || '').toLowerCase()
  if (!host) return false

  for (const rawRule of allowlist) {
    const rule = rawRule.trim().toLowerCase()
    if (!rule) continue
    if (rule === '*') return true
    if (rule.startsWith('*.')) {
      const suffix = rule.slice(2)
      if (host === suffix || host.endsWith(`.${suffix}`)) return true
      continue
    }
    if (host === rule) return true
  }

  return false
}

// Chrome match patterns for allowlist entries ("medium.com", "*.medium.com").
export const allowlistToMatchPatterns = (items: string[]): string[] => {
  const out = new Set<string>()
  for (const raw of items) {
    const host = raw.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
    if (!host || !/^(\*\.)?[a-z0-9.-]+$/.test(host)) continue
    out.add(`https://${host}/*`)
  }
  return [...out]
}

// Allowlist entries the extension does not already hold at install time; the
// user is asked for these when saving the allowlist.
export const extraAllowlistPatterns = (items: string[]): string[] => {
  const builtIn = new Set(allowlistToMatchPatterns(DEFAULT_SITE_ALLOWLIST))
  return allowlistToMatchPatterns(items).filter((p) => !builtIn.has(p))
}

// Origin pattern for a non-local Ollama URL, or null for localhost/127.0.0.1
// (those are already granted).
export const ollamaPermissionPattern = (url: string): string | null => {
  try {
    const u = new URL(url)
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return null
    return `${u.protocol}//${u.hostname}/*`
  } catch {
    return null
  }
}
