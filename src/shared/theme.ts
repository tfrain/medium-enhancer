// Light / dark theme (0.11). One setting, `theme` in chrome.storage.local:
// 'auto' follows the system, 'light' and 'dark' force it. Extension pages
// (popup, Options, Bookshelf) also keep a localStorage copy so the first paint
// already has the right colors: localStorage is synchronous, chrome.storage
// is not. Content scripts cannot read the extension's localStorage, so the
// in-page panels get the setting through src/contents/lib/theme.ts.

export type Theme = 'auto' | 'light' | 'dark'

export const THEME_KEY = 'theme'
export const THEME_LOCAL_KEY = 'me-theme'
export const THEMES: Theme[] = ['auto', 'light', 'dark']
export const THEME_LABELS: Record<Theme, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }
export const THEME_ICONS: Record<Theme, string> = { auto: '◐', light: '☀', dark: '☾' }

export const normalizeTheme = (value: unknown): Theme =>
  THEMES.includes(value as Theme) ? value as Theme : 'auto'

export const nextTheme = (theme: Theme): Theme => THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]

/** Dark rules for in-page panels, written against the panel ids. Returns them
 * twice: forced by data-me-theme="dark" on the panel root, and under
 * prefers-color-scheme for 'auto' (anything but "light"). */
export const darkCss = (ids: string[], css: string): string => {
  const scope = (suffix: string) => ids.reduce(
    (out, id) => out.replace(new RegExp(`#${id}(?![\\w-])`, 'g'), `#${id}${suffix}`), css)
  return `${scope('[data-me-theme="dark"]')}\n@media (prefers-color-scheme: dark) {\n${scope(':not([data-me-theme="light"])')}\n}\n`
}

const readLocal = (): Theme => {
  try { return normalizeTheme(localStorage.getItem(THEME_LOCAL_KEY)) } catch { return 'auto' }
}

const writeLocal = (theme: Theme) => {
  try { localStorage.setItem(THEME_LOCAL_KEY, theme) } catch { /* storage blocked: next open reads chrome.storage */ }
}

/** Extension pages: apply the cached theme now, then follow chrome.storage. */
export const applyPageTheme = (onChange?: (theme: Theme) => void) => {
  const apply = (theme: Theme) => {
    document.documentElement.dataset.theme = theme
    writeLocal(theme)
    onChange?.(theme)
  }
  apply(readLocal())
  chrome.storage.local.get(THEME_KEY).then(items => apply(normalizeTheme(items[THEME_KEY]))).catch(() => {})
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[THEME_KEY]) apply(normalizeTheme(changes[THEME_KEY].newValue))
  })
}

export const saveTheme = async (theme: Theme) => {
  writeLocal(theme)
  await chrome.storage.local.set({ [THEME_KEY]: theme })
}
