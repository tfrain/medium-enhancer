import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { event, loadSource } from './load-source.ts'

const load = (local: Record<string, string> = {}, stored: Record<string, unknown> = {}) => {
  const changed = event()
  const sets: Record<string, unknown>[] = []
  const documentElement = { dataset: {} as Record<string, string> }
  const theme = loadSource('src/shared/theme.ts', {
    document: { documentElement },
    localStorage: { getItem: (k: string) => local[k] ?? null, setItem: (k: string, v: string) => { local[k] = v } },
    chrome: { storage: { onChanged: changed, local: { get: async () => stored, set: async (o: Record<string, unknown>) => { sets.push(o) } } } },
  })
  return { theme, changed, sets, local, documentElement }
}

{
  const { theme } = load()
  assert.equal(theme.normalizeTheme('dark'), 'dark')
  assert.equal(theme.normalizeTheme('purple'), 'auto', 'unknown values fall back to auto')
  assert.equal(theme.normalizeTheme(undefined), 'auto')
  assert.deepEqual(['auto', 'light', 'dark'].map(theme.nextTheme), ['light', 'dark', 'auto'])
}

{
  const { theme } = load()
  const css = theme.darkCss(['__me_x__'], '#__me_x__ { color: #fff; }\n#__me_x__ .a, #__me_x__-other { color: red; }')
  assert.match(css, /#__me_x__\[data-me-theme="dark"\] \{ color: #fff; \}/, 'forced dark scopes the root')
  assert.match(css, /#__me_x__\[data-me-theme="dark"\] \.a/, 'and descendants')
  assert.match(css, /@media \(prefers-color-scheme: dark\) \{\n#__me_x__:not\(\[data-me-theme="light"\]\)/, 'auto follows the system unless forced light')
  assert.ok(css.includes('#__me_x__-other'), 'longer ids that share a prefix are left alone')
  assert.ok(!css.includes('#__me_x__[data-me-theme="dark"]-other'))
}

{
  // The cached copy paints first; chrome.storage wins once it answers; changes apply live.
  const { theme, changed, local, documentElement } = load({ 'me-theme': 'dark' }, { theme: 'light' })
  const seen: string[] = []
  theme.applyPageTheme((t: string) => seen.push(t))
  assert.equal(documentElement.dataset.theme, 'dark', 'first paint uses the localStorage copy')
  await new Promise(setImmediate)
  assert.equal(documentElement.dataset.theme, 'light')
  assert.equal(local['me-theme'], 'light', 'the copy is refreshed for the next open')
  changed.emit({ theme: { newValue: 'dark' } }, 'sync')
  assert.equal(documentElement.dataset.theme, 'light', 'sync-area changes are ignored')
  changed.emit({ theme: { newValue: 'dark' } }, 'local')
  assert.equal(documentElement.dataset.theme, 'dark')
  assert.deepEqual(seen, ['dark', 'light', 'dark'])
}

{
  const { theme, sets, local } = load()
  await theme.saveTheme('dark')
  assert.deepEqual(JSON.parse(JSON.stringify(sets)), [{ theme: 'dark' }])
  assert.equal(local['me-theme'], 'dark')
}

{
  // Every in-page panel's dark rules go through darkCss, so the Light setting can switch them off.
  for (const file of ['src/contents/ui/summary-panel.ts', 'src/contents/ui/quote-card-panel.ts', 'src/contents/ui/self-cite-panel.ts']) {
    const src = readFileSync(file, 'utf8')
    assert.ok(!src.includes('@media (prefers-color-scheme'), `${file}: no bare system dark rules`)
    assert.ok(src.includes('darkCss(') && src.includes('themeElement('), `${file}: themed`)
  }
  assert.ok(readFileSync('src/contents/util/toast.ts', 'utf8').includes('themeElement('))
  for (const file of ['src/popup.css', 'src/options.css', 'src/tabs/bookshelf.css']) {
    const css = readFileSync(file, 'utf8')
    assert.ok(css.includes(':root[data-theme="dark"]') && css.includes(':root:not([data-theme="light"])'), `${file}: honours the setting`)
  }
}

{
  // A cycling button showed the current theme and switched to the next, so
  // clicking "Dark" made it Auto. Each choice is its own button now.
  const popup = readFileSync('src/popup.tsx', 'utf8')
  assert.ok(!popup.includes('nextTheme('), 'popup theme control does not cycle')
  assert.ok(popup.includes('THEMES.map('), 'popup offers each theme as its own button')
}

console.log('PASS theme: normalize, cycle, darkCss scoping, first paint from cache, live changes, panels themed')
