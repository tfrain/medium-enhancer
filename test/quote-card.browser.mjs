// Offline smoke test against a synthetic Medium story, using the built extension.
// Run: npm i --no-save puppeteer-core@22 && npm run build && node test/quote-card.browser.mjs
// (uses the existing local Playwright Chromium; no network, no Medium account).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import puppeteer from 'puppeteer-core'
const extension = path.resolve('build/chrome-mv3-prod')
const executablePath = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1134/chrome-mac/Chromium.app/Contents/MacOS/Chromium')
const story = 'https://medium.com/@writer/a-story-abcdef123456'
const html = `<!doctype html><html><head><title>A story</title><meta name="author" content="Test Author"><link rel="canonical" href="${story}"></head><body><button id="before">Before</button><article><h1>A story</h1><a data-testid="publicationName">Test Publication</a><p id="a1b2">A useful paragraph with enough words for a quote card.</p><p id="bad-id">Another paragraph with no Medium paragraph name.</p><p id="c3d4">${'Long quotation text '.repeat(70)}</p><div class="responses"><p id="excluded">A response</p></div><p id="after">After response</p><div contenteditable="true"><p id="editor">Editor text</p></div></article></body></html>`
;(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'me-pro-browser-'))
  let browser
  try {
    browser = await puppeteer.launch({ executablePath, headless: false, userDataDir: profile,
      args: ['--headless=new', '--disable-crash-reporter', '--disable-breakpad', '--no-first-run', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`] })
    const workerTarget = await browser.waitForTarget(t => t.type() === 'service_worker')
    const worker = await workerTarget.worker()
    const extensionId = new URL(workerTarget.url()).host
    const page = await browser.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    await page.setRequestInterception(true)
    page.on('request', request => request.isNavigationRequest() ? request.respond({ status: 200, contentType: 'text/html', body: html })
      // Only block the network; the extension's own chrome-extension:// files must load.
      : /^https?:/.test(request.url()) ? request.abort() : request.continue())
    await page.goto(story)
    // Installing the extension opens its Options tab, which takes focus; a background
    // tab pauses requestAnimationFrame, and the Card button is positioned in one.
    await page.bringToFront()
    const select = async (id, collapse = false) => page.evaluate((id, collapse) => {
      const range = document.createRange()
      range.selectNodeContents(document.getElementById(id))
      if (collapse) range.collapse(true)
      const selection = window.getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
    }, id, collapse)
    // The content script runs in an isolated world, so the page cannot see its globals;
    // wait for its first visible effect instead, re-selecting until it has mounted.
    for (let i = 0; ; i++) {
      await select('a1b2')
      try { await page.waitForSelector('#__me_quote_card_button__', { visible: true, timeout: 500 }); break }
      catch (e) { if (i >= 20) throw e }
    }
    await page.focus('#before')
    await page.click('#__me_quote_card_button__')
    await page.waitForSelector('#__me_quote_card_panel__ canvas')
    assert.equal(await page.$eval('#__me_quote_card_panel__', e => e.getAttribute('aria-modal')), 'true')
    assert.ok(await page.$eval('#__me_quote_card_panel__', e => e.contains(document.activeElement)), 'opening focuses the dialog')
    await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift')
    assert.equal(await page.evaluate(() => document.activeElement.tagName), 'INPUT', 'Shift+Tab from panel wraps to last control')
    await page.keyboard.press('Tab')
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('aria-label')), 'Close', 'Tab wraps to first control')
    assert.equal(await page.$eval('#__me_quote_card_panel__ input', e => e.value), 'https://medium.com/p/abcdef123456#a1b2')
    assert.equal(await page.$$eval('#__me_quote_card_panel__ button:disabled', es => es.length), 5)
    assert.deepEqual(await page.$eval('#__me_quote_card_panel__ canvas', e => [e.width, e.height]), [1200, 675])
    assert.ok(await page.$eval('#__me_quote_card_panel__', e => e.textContent.includes('Test Author') && e.textContent.includes('Test Publication')))
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.getElementById('__me_quote_card_panel__'))
    assert.equal(await page.evaluate(() => document.activeElement.id), 'before', 'close restores focus')
    // No selection: hover offers a whole-paragraph card, including all its text.
    await select('a1b2', true)
    await page.hover('#a1b2')
    await page.waitForSelector('#__me_quote_card_hover__', { visible: true })
    assert.equal(await page.$eval('#__me_quote_card_hover__', e => e.getAttribute('aria-label')), 'Make a quote card from this paragraph')
    await page.click('#__me_quote_card_hover__')
    await page.waitForSelector('#__me_quote_card_panel__ canvas')
    assert.equal(await page.$eval('#__me_quote_card_panel__ canvas', e => e.getAttribute('aria-label')), 'Quote by Test Author: A useful paragraph with enough words for a quote card.')
    await page.waitForFunction(() => document.getElementById('__me_quote_card_hover__')?.hidden)
    // Pointer leaves the panel -> it closes after a short grace period, not instantly.
    const box = await page.$eval('#__me_quote_card_panel__', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height } })
    await page.mouse.move(box.x + box.w / 2, box.y + box.h / 2, { steps: 4 })
    await page.mouse.move(2, 2, { steps: 4 })
    await new Promise(r => setTimeout(r, 200))
    assert.ok(await page.$('#__me_quote_card_panel__'), 'still open during the grace period')
    await page.waitForFunction(() => !document.getElementById('__me_quote_card_panel__'), { polling: 100, timeout: 3000 })
    // A click anywhere outside the panel closes it at once.
    await page.hover('#a1b2')
    await page.waitForSelector('#__me_quote_card_hover__', { visible: true })
    await page.click('#__me_quote_card_hover__')
    await page.waitForSelector('#__me_quote_card_panel__ canvas')
    await page.mouse.click(2, 2)
    await page.waitForFunction(() => !document.getElementById('__me_quote_card_panel__'), { polling: 100, timeout: 1000 })
    for (const [startId, endId] of [['a1b2', 'excluded'], ['excluded', 'after'], ['a1b2', 'after'], ['a1b2', 'editor']]) {
      await page.evaluate((startId, endId) => {
        const range = document.createRange()
        range.setStart(document.getElementById(startId).firstChild, 0)
        range.setEnd(document.getElementById(endId).firstChild, 3)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
      }, startId, endId)
      await page.waitForFunction(() => document.getElementById('__me_selection_toolbar__')?.hidden)
    }
    await select('a1b2')
    await page.waitForSelector('#__me_quote_card_button__', { visible: true })
    await select('bad-id')
    await page.waitForSelector('#__me_quote_card_button__', { visible: true })
    await page.click('#__me_quote_card_button__')
    await page.waitForSelector('#__me_quote_card_panel__ canvas')
    assert.equal(await page.$eval('#__me_quote_card_panel__ input', e => e.value), story)
    await page.click('#__me_quote_card_panel__ [aria-label="Close"]')
    await select('c3d4')
    await page.waitForSelector('#__me_quote_card_button__', { visible: true })
    await page.click('#__me_quote_card_button__')
    await page.waitForFunction(() => document.querySelector('#__me_quote_card_panel__')?.textContent.includes('truncated'))
    await page.evaluate(() => { history.pushState({}, '', '/@writer'); window.dispatchEvent(new PopStateEvent('popstate')) })
    await page.waitForFunction(() => !document.getElementById('__me_quote_card_panel__'))
    const options = await browser.newPage()
    await options.goto(`chrome-extension://${extensionId}/options.html`)
    await options.waitForSelector('#pro-key')
    assert.ok(await options.evaluate(() => document.body.textContent.includes('Not unlocked')))
    assert.deepEqual(await options.$$eval('a', es => es.filter(e => e.textContent === 'Get a key').map(e => e.href)), ['https://buy.stripe.com/6oU00j1iRarUfNR2X54ow01'])
    await options.type('#pro-key', 'invalid')
    await options.click('button[type="submit"]')
    await options.waitForFunction(() => document.body.textContent.includes('That key did not work'))
    assert.deepEqual(errors, [])
    console.log('PASS offline browser: selection, paragraph hover, panel closes on pointer-leave and outside click, Canvas, locked choices, attribution, paragraph fallback, truncation, SPA cleanup and Pro Options')
  } finally {
    if (browser) await browser.close()
    fs.rmSync(profile, { recursive: true, force: true })
  }
})().catch(error => { console.error('FAIL quote-card browser:', error); process.exit(1) })
