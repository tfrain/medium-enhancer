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
  'medium.programmerscareer.com',
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
