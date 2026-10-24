import { normalizeTheme, type Theme } from '../../shared/theme'

// The theme for in-page panels. index.ts reads it with the other settings and
// calls setContentTheme; panels call themeElement on their root when they
// create it. The attribute carries only auto/light/dark, never user data.
let theme: Theme = 'auto'

export const contentTheme = () => theme

export const themeElement = (el: Element) => {
  el.setAttribute('data-me-theme', theme)
}

export const setContentTheme = (value: unknown) => {
  theme = normalizeTheme(value)
  document.querySelectorAll('[data-me-theme]').forEach(el => el.setAttribute('data-me-theme', theme))
}
