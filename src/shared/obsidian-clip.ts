import { createObsidianAdvancedUri } from './obsidian-uri'

// Obsidian is an optional, explicit export target alongside Markdown download.
export const OBSIDIAN_SENT_MESSAGE = 'Sent to Obsidian. If no note appears, check that Obsidian and its Advanced URI plugin are installed, or use Convert Page to Markdown to download the file.'

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
  obsidianClipperEnabled: false,   // most users have no Obsidian: default to a .md download
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

  // Extension tabs can use their own clipboard; scripting cannot inject into
  // chrome-extension:// pages. Ordinary content-script exports keep the old path.
  const libraryPage = typeof window !== 'undefined' && window.location.href.split(/[?#]/)[0] === chrome.runtime.getURL('tabs/bookshelf.html')
  let libraryTabId: number | undefined
  let clipboardReady = false
  if (libraryPage) {
    libraryTabId = (await chrome.tabs.getCurrent())?.id
    if (libraryTabId === undefined) return { ok: false, error: 'Cannot resolve Bookshelf tab.' }
    const uri = createObsidianAdvancedUri({ vault: settings.obsidianVault, folder: settings.obsidianFolder,
      title: clip.title, filepath, markdown: clip.markdown })
    if (uri.transport === 'clipboard') {
      await navigator.clipboard.writeText(clip.markdown)
      clipboardReady = true
    }
  }
  const response = await chrome.runtime.sendMessage({
    type: 'send-to-obsidian',
    ...(libraryPage ? { libraryTabId, clipboardReady } : {}),
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
