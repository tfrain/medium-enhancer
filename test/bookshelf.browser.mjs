// Manual, offline browser smoke test. DO NOT include in the unit-test loop.
// Requires pnpm build, locally installed puppeteer-core and the Chromium path
// used by quote-card.browser.mjs (override with CHROMIUM_PATH if desired).
// Run explicitly: node test/bookshelf.browser.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import puppeteer from 'puppeteer-core'

const story = 'https://medium.com/@writer/a-story-abcdef123456'
const key = 'abcdef123456'
const body = 'A useful quokka paragraph with enough rendered words for the local Markdown archive. '.repeat(4)
const html = `<!doctype html><html><head><title>A bookshelf story</title><meta name="author" content="Test Author"><link rel="canonical" href="${story}"></head><body><article><h1>A bookshelf story</h1><h2 class="pw-subtitle-paragraph">A local library</h2><a data-testid="publicationName">Test Publication</a><p id="a1b2">${body}</p><p id="c3d4">Another paragraph in the user's own page.</p></article></body></html>`
const executablePath = process.env.CHROMIUM_PATH || path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1134/chrome-mac/Chromium.app/Contents/MacOS/Chromium')

// Inject a generated TEST hash into an isolated copy of the built extension.
// Like pro.test.ts's custom keys array, no production key is known or used.
// Plaintext exists only in this test process and its temporary browser profile.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'me-bookshelf-browser-'))
const extension = path.join(root, 'extension')
const downloads = path.join(root, 'downloads')
const testKey = randomBytes(24).toString('hex').toUpperCase()
const testHash = createHash('sha256').update(testKey).digest('hex')
const source = fs.readFileSync('src/shared/pro.ts', 'utf8')
const shippedHash = source.match(/hash: '([a-f0-9]{64})'/)?.[1]
assert.ok(shippedHash)
let browser
try {
  fs.cpSync(path.resolve('build/chrome-mv3-prod'), extension, { recursive: true })
  fs.mkdirSync(downloads)
  let replacements = 0
  for (const file of fs.readdirSync(extension, { recursive: true }).filter(file => file.endsWith('.js'))) {
    const filename = path.join(extension, file)
    const js = fs.readFileSync(filename, 'utf8')
    if (!js.includes(shippedHash)) continue
    replacements++
    fs.writeFileSync(filename, js.replaceAll(shippedHash, testHash))
  }
  assert.ok(replacements > 0, 'the test hash must reach the copied Pro bundles')
  browser = await puppeteer.launch({ executablePath, headless: false, userDataDir: path.join(root, 'profile'), args: [
    '--headless=new', '--disable-crash-reporter', '--disable-breakpad', '--no-first-run',
    `--disable-extensions-except=${extension}`, `--load-extension=${extension}`,
  ] })
  const target = await browser.waitForTarget(t => t.type() === 'service_worker')
  const worker = await target.worker()
  const extensionId = new URL(target.url()).host
  const session = await browser.target().createCDPSession()
  await session.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads })
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setRequestInterception(true)
  page.on('request', request => {
    if (request.isNavigationRequest() && request.url() === story) return request.respond({ status: 200, contentType: 'text/html', body: html })
    return /^https?:/.test(request.url()) ? request.abort() : request.continue()
  })
  await page.goto(story)
  await page.bringToFront()
  const storyTab = await worker.evaluate(async story => (await chrome.tabs.query({})).find(tab => tab.url === story).id, story)
  // Copy Page as Markdown: the content script writes the clipboard itself.
  await browser.defaultBrowserContext().overridePermissions('https://medium.com', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write'])
  const copied = await worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { type: 'clipPageAsMarkdown', target: 'copy' }), storyTab)
  assert.equal(copied.ok, true, 'copy target answers ok: ' + JSON.stringify(copied))
  assert.equal(copied.mode, 'copy')
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  assert.ok(clipboard.includes('quokka') && clipboard.includes('A bookshelf story'), 'clipboard holds the article as Markdown')
  // A real popup queries the active story. Loading its HTML in an inactive tab
  // preserves that behavior and allows automation without opening browser chrome.
  const popupUrl = `chrome-extension://${extensionId}/popup.html`
  await worker.evaluate(url => chrome.tabs.create({ url, active: false }), popupUrl)
  const popup = await (await browser.waitForTarget(t => t.url() === popupUrl)).page()
  await popup.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent === 'Save to Bookshelf'), { polling: 100 })
  // RSS feeds now come from the content script's pageReport (no tabs.onUpdated), via storage.session.
  await popup.waitForFunction(() => document.body.innerText.includes('medium.com/feed/@writer'), { polling: 100, timeout: 8000 })
  const click = (p, label) => p.evaluate(label => {
    const button = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === label)
    if (!button || button.disabled) throw new Error(`Missing/enabled button: ${label}`)
    button.click()
  }, label)
  await click(popup, 'Save to Bookshelf')
  await popup.waitForFunction(() => document.body.textContent.includes('Saved to Bookshelf'), { polling: 100 })
  const shelf = await browser.newPage()
  shelf.on('pageerror', error => errors.push(error.message))
  await shelf.goto(`chrome-extension://${extensionId}/tabs/bookshelf.html`)
  await shelf.waitForSelector(`[data-item-key="${key}"]`)
  assert.equal(await shelf.$eval('input[type="search"]', el => el.disabled), true)
  assert.ok(await shelf.$eval(`[data-item-key="${key}"]`, el => el.textContent.includes('Test Author') && el.textContent.includes('Test Publication')))
  // Free metadata saves do not contain an archive, even though the page has text.
  assert.equal(await shelf.evaluate(async key => {
    const response = await chrome.runtime.sendMessage({ type: 'bookshelf', action: 'status', key })
    return response.archived
  }, key), false)
  await click(shelf, 'Mark read')
  await shelf.waitForFunction(() => !document.querySelector('[data-item-key]'))
  await click(shelf, 'Read')
  await shelf.waitForSelector(`[data-item-key="${key}"]`)
  await click(shelf, 'Mark unread')
  await click(shelf, 'All')
  await shelf.waitForSelector(`[data-item-key="${key}"]`)
  await click(shelf, 'Delete')
  await shelf.waitForSelector('.shelf-toast')
  await click(shelf, 'Undo')
  await shelf.waitForSelector(`[data-item-key="${key}"]`)
  // Unlock through the same storage/validation route, using only the injected
  // random test hash. No real Pro key or source-table mutation is involved.
  await worker.evaluate(testKey => chrome.storage.local.set({ enhancerProUnlocked: true, enhancerProKey: testKey }), testKey)
  await shelf.waitForFunction(() => !document.querySelector('input[type="search"]').disabled)
  // Dispatch the same content message used by the context-menu handler. Native
  // context-menu registration/click routing is separately covered by unit tests.
  assert.equal((await worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { type: 'saveToBookshelf', archiveOnly: true }), storyTab)).ok, true)
  await page.evaluate(() => {
    const range = document.createRange()
    range.selectNodeContents(document.getElementById('a1b2'))
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range)
  })
  assert.equal((await worker.evaluate(tabId => chrome.tabs.sendMessage(tabId, { type: 'highlightToBookshelf' }), storyTab)).ok, true)
  await shelf.reload()
  await shelf.waitForSelector('.shelf-highlight')
  assert.equal(await shelf.$eval('.shelf-highlight a', el => el.href), 'https://medium.com/p/abcdef123456#a1b2')
  await shelf.type('textarea', 'remember the wombat note')
  await click(shelf, 'Save note')
  await shelf.waitForFunction(() => document.querySelector('.shelf-note button').disabled)
  // In-page highlights (0.10.x): reopening the saved story marks the passage, with the note as its tooltip.
  await page.reload()
  await page.waitForFunction(() => !!document.querySelector('#a1b2 mark.me-shelf-hl'), { polling: 100, timeout: 15000 })
  const marked = await page.evaluate(() => ({
    text: [...document.querySelectorAll('#a1b2 mark.me-shelf-hl')].map(m => m.textContent).join('').replace(/\s+/g, ' ').trim(),
    whole: document.getElementById('a1b2').textContent.replace(/\s+/g, ' ').trim(),
    title: document.querySelector('#a1b2 mark.me-shelf-hl').title,
    other: document.querySelectorAll('#c3d4 mark.me-shelf-hl').length,
  }))
  assert.equal(marked.text, marked.whole, 'the whole highlighted paragraph is marked')
  assert.equal(marked.title, 'remember the wombat note', 'the note is the tooltip')
  assert.equal(marked.other, 0, 'unhighlighted paragraphs stay plain')
  await worker.evaluate(() => chrome.storage.local.set({ bookshelfInPageHighlights: false }))
  await page.waitForFunction(() => !document.querySelector('mark.me-shelf-hl'), { polling: 100, timeout: 5000 })
  await worker.evaluate(() => chrome.storage.local.set({ bookshelfInPageHighlights: true }))
  await page.waitForFunction(() => !!document.querySelector('#a1b2 mark.me-shelf-hl'), { polling: 100, timeout: 8000 })
  await shelf.type('input[type="search"]', 'wombat')
  await shelf.waitForFunction(() => document.querySelector('.shelf-snippet')?.textContent.includes('wombat'))
  await shelf.$eval('input[type="search"]', el => { const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(el, ''); el.dispatchEvent(new Event('input', { bubbles: true })) })
  await shelf.type('input[type="search"]', 'quokka')
  await shelf.waitForFunction(() => document.querySelector('.shelf-snippet')?.textContent.includes('quokka'))
  assert.ok(await shelf.$eval('.shelf-archive', el => el.textContent.includes('quokka')))
  await click(shelf, 'Export all (.zip)')
  await shelf.waitForFunction(() => document.body.textContent.includes('ZIP backup saved'))
  const downloaded = fs.readdirSync(downloads).find(file => file.endsWith('.zip'))
  assert.ok(downloaded)
  const zip = fs.readFileSync(path.join(downloads, downloaded))
  assert.equal(zip.readUInt32LE(0), 0x04034b50)
  const nameSize = zip.readUInt16LE(26)
  const dataSize = zip.readUInt32LE(18)
  const markdown = zip.subarray(30 + nameSize, 30 + nameSize + dataSize).toString('utf8')
  for (const value of ['title: "A bookshelf story"', 'author: "Test Author"', 'publication: "Test Publication"', 'quokka', 'remember the wombat note', '> -']) assert.ok(markdown.includes(value), value)
  assert.deepEqual(errors, [])
  console.log('PASS offline Bookshelf: RSS feed via pageReport, copy page as Markdown, in-page highlights with note tooltip and toggle, popup save, read filters, delete/undo, context capture path, test-only Pro archive/highlight, note search, archive search and ZIP download')
} finally {
  if (browser) await browser.close()
  fs.rmSync(root, { recursive: true, force: true })
}
