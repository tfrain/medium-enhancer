// Real-browser test: loads build/chrome-mv3-prod into a fresh, signed-out
// Chromium profile (Playwright's bundled Chromium; branded Chrome 137+ ignores
// --load-extension). Checks install, where the content script auto-runs, the
// Markdown export default, and the Options page.
//
//   npm i --no-save playwright-core && OUT=/tmp/me-e2e node test/real-browser.e2e.js
//
// Medium's Cloudflare blocks automated browsers ("Sorry, you have been
// blocked"), so the two Medium-content checks (Markdown text, RSS feeds) fail
// here by design; verify those by hand in your own browser. Do not try to get
// around the block.
const { chromium } = require('playwright-core');
const path = require('path'), os = require('os'), fs = require('fs');
const EXT = path.join(os.homedir(), 'Repos/medium-enhancer/build/chrome-mv3-prod');
const EXE = path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1134/chrome-mac/Chromium.app/Contents/MacOS/Chromium');
const OUT = process.env.OUT;
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''));
  if (!cond) process.exitCode = 1;
};
(async () => {
  const profile = fs.mkdtempSync(path.join(OUT, 'profile-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: EXE, headless: false,
    args: ['--headless=new', '--disable-crash-reporter', '--disable-breakpad', `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    userAgent: undefined,
  });
  let [sw] = ctx.serviceWorkers();
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 });
  const id = sw.url().split('/')[2];
  const ver = await sw.evaluate(() => chrome.runtime.getManifest().version);
  ok('extension loads', !!id, `id=${id} version=${ver}`);
  // first-install should open options page (install only)
  await new Promise(r => setTimeout(r, 1500));
  ok('options page opened on install', ctx.pages().some(p => p.url().includes('/options.html')), ctx.pages().map(p => p.url()).join(' , '));

  const ping = (tabUrlPart) => sw.evaluate(async (part) => {
    const [tab] = (await chrome.tabs.query({})).filter(t => (t.url || '').includes(part));
    if (!tab) return { err: 'no tab (or url hidden: no host permission)' };
    return await new Promise(res => chrome.tabs.sendMessage(tab.id, { type: 'me-ping' }, r => res({ id: tab.id, r: r || null, le: chrome.runtime.lastError && chrome.runtime.lastError.message })));
  }, tabUrlPart);

  const medium = await ctx.newPage();
  await medium.goto('https://medium.com/p/0c47971a13d0', { waitUntil: 'domcontentloaded', timeout: 45000 });
  await medium.waitForTimeout(4000);
  const canon = await medium.evaluate(() => (document.querySelector('link[rel=canonical]') || {}).href || location.href);
  console.log('canonical:', canon);
  await medium.goto(canon, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await medium.waitForTimeout(7000);
  const pm = await ping('medium.com');
  ok('Medium: content script auto-injected', pm.r && pm.r.ok === true, JSON.stringify(pm));

  const wiki = await ctx.newPage();
  await wiki.goto('https://en.wikipedia.org/wiki/Sphere_1', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => console.log('wiki nav', e.message));
  await wiki.waitForTimeout(3000);
  const wikiTabs = await sw.evaluate(async () => (await chrome.tabs.query({})).map(t => t.url || '(hidden)'));
  ok('Wikipedia: tab URL hidden from extension (no host permission)', wikiTabs.filter(u => u.includes('wikipedia')).length === 0, wikiTabs.join(' , '));
  const wikiInjected = await wiki.evaluate(() => window.__mediumEnhancerLoaded === true).catch(() => 'n/a');
  ok('Wikipedia: content script NOT auto-injected', wikiInjected !== true, String(wikiInjected));

  if (pm.id) {
    const clip = await sw.evaluate(async (tabId) => await new Promise(res => chrome.tabs.sendMessage(tabId, { type: 'clipPageAsMarkdown', target: 'download' }, r => res(r || { le: chrome.runtime.lastError && chrome.runtime.lastError.message }))), pm.id);
    ok('Medium: Convert Page to Markdown returns markdown (explicit download target)', clip && clip.ok && clip.mode === 'download' && clip.markdown && clip.markdown.length > 2000, `mode=${clip && clip.mode} title=${clip && (clip.title||'').slice(0,60)} chars=${clip && clip.markdown ? clip.markdown.length : 0} ${clip && clip.error ? 'error='+clip.error : ''}`);
    if (clip && clip.markdown) fs.writeFileSync(path.join(OUT, 'clip.md'), clip.markdown);
    const feeds = await sw.evaluate(async (tabId) => (await chrome.storage.local.get(`feeds_${tabId}`))[`feeds_${tabId}`] || null, pm.id);
    ok('Medium: RSS feeds found', Array.isArray(feeds) && feeds.length > 0, JSON.stringify(feeds));
  }

  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${id}/options.html`);
  await opt.waitForTimeout(1500);
  const switches = await opt.locator('.switch input').count();
  ok('Options: 3 feature switches render', switches === 3, `switches=${switches}`);
  await opt.locator('.switch input').first().evaluate(el => el.click());
  await opt.waitForTimeout(800);
  const ai = await sw.evaluate(async () => (await chrome.storage.local.get('aiSummaryEnabled')).aiSummaryEnabled);
  ok('Options: turning AI Summary off is saved', ai === false, `aiSummaryEnabled=${ai}`);
  const toast = await opt.locator('.toast.show').count();
  ok('Options: "Saved" toast shows', toast === 1);
  await opt.setViewportSize({ width: 1000, height: 1100 });
  await opt.screenshot({ path: path.join(OUT, 'options-real.png'), fullPage: true });
  const errs = [];
  opt.on('pageerror', e => errs.push(e.message));
  await opt.reload(); await opt.waitForTimeout(1000);
  ok('Options: no page errors on reload', errs.length === 0, errs.join(' | '));
  await ctx.close();
})().catch(e => { console.error('HARNESS ERROR', e); process.exit(1); });
