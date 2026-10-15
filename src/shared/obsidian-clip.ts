// Shared between ai-menu.ts (Medium-only "Clip to Obsidian" button) and
// contents/index.ts (any-site "Convert Page to Markdown" trigger) — both
// route a clipped article through the same Obsidian vault settings so a
// click always lands in the same configured folder (default "clippers").

export type ClipForObsidian = {
  title: string
  markdown: string
  author?: string
  domain?: string
  published?: string
}

export const getStorage = <T extends Record<string, any>>(defaults: T): Promise<T> =>
  new Promise((resolve) => {
    chrome.storage.local.get(defaults, (items) => resolve(items as T))
  })

export const safePathValue = (value: string, fallback: string): string =>
  String(value || fallback)
    .replace(/[?<>\\:*|":]/g, '')
    .replace(/\s+/g, ' ')
    .trim() || fallback

export const formatPublishedDate = (published?: string): string => {
  if (!published) return new Date().toISOString().slice(0, 10)
  const date = new Date(published)
  return Number.isNaN(date.getTime())
    ? published.slice(0, 10)
    : date.toISOString().slice(0, 10)
}

export const renderObsidianPathTemplate = (template: string, clip: ClipForObsidian): string => {
  const value = String(template || '').trim()
  if (!value) return ''

  const rendered = value
    .replace(/\{title\}/g, safePathValue(clip.title, 'Untitled'))
    .replace(/\{author\}/g, safePathValue(clip.author || '', 'Unknown Author'))
    .replace(/\{domain\}/g, safePathValue(clip.domain || '', 'medium.com'))
    .replace(/\{date\}/g, safePathValue(formatPublishedDate(clip.published), 'undated'))
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/')

  return rendered.endsWith('.md') ? rendered : `${rendered}.md`
}

export const OBSIDIAN_SETTINGS_DEFAULTS = {
  obsidianClipperEnabled: true,
  obsidianVault: '',
  obsidianFolder: 'clippers',
  obsidianPathTemplate: '',
}

// Send an already-clipped article through the existing background
// "send-to-obsidian" pipeline (obsidian://adv-uri). Must be called from a
// content script (not the popup) so the background handler can resolve
// sender.tab.id and navigate the right tab.
export const sendClipToObsidian = async (
  clip: ClipForObsidian,
): Promise<{ ok: true; filepath: string } | { ok: false; error: string }> => {
  const settings = await getStorage(OBSIDIAN_SETTINGS_DEFAULTS)
  const filepath = renderObsidianPathTemplate(settings.obsidianPathTemplate, clip)

  const response = await chrome.runtime.sendMessage({
    type: 'send-to-obsidian',
    markdown: clip.markdown,
    title: clip.title,
    vault: settings.obsidianVault,
    folder: settings.obsidianFolder,
    filepath,
  })

  if (!response?.ok) {
    return { ok: false, error: response?.error || 'Failed to send article to Obsidian.' }
  }
  return { ok: true, filepath: response.filepath }
}
