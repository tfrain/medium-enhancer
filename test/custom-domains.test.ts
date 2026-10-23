import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

if (!process.env.CUSTOM_DOMAIN_CASE) {
  for (const mode of ['enable', 'remove', 'feeds', 'reconcile', 'concurrent']) {
    execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', fileURLToPath(import.meta.url)], { env: { ...process.env, CUSTOM_DOMAIN_CASE: mode }, stdio: 'inherit' })
  }
  process.exit(0)
}
import { event, loadSource } from './load-source.ts'

const host = 'pub.huizhou92.com'
const url = `https://${host}/story-b61d5eda73ec`
let hosts: string[] = []
let permitted = true
const revoked = new Set<string>()
const registrations = new Map<string, any>()
const injected: any[] = []
const session: Record<string, any> = {}
const files = ['content.hash.js', 'another.js']
const chrome = {
  runtime: { id: 'test', onMessage: event(), onConnect: event(), onStartup: event(), onInstalled: event(), onUpdateAvailable: event(),
    getManifest: () => ({ version: '0.0.0', content_scripts: [{ js: files }] }), getURL: (p: string) => `chrome-extension://test/${p}` },
  commands: { onCommand: event() },
  contextMenus: { onClicked: event(), removeAll: async () => {}, create: () => {}, update: (_id: string, _data: any, cb: any) => cb() },
  tabs: { get: async (id: number) => ({ id, url: id === 8 ? 'https://second.test/story-b61d5eda73ec' : url }), query: (_q: any, cb: any) => cb([]) },
  permissions: { contains: async ({ origins }: any) => permitted && !revoked.has(origins[0]), remove: async ({ origins }: any) => { revoked.add(origins[0]); return true } },
  scripting: {
    getRegisteredContentScripts: async () => [...registrations.values()],
    registerContentScripts: async (scripts: any[]) => scripts.forEach(s => { assert.equal(registrations.has(s.id), false); registrations.set(s.id, s) }),
    unregisterContentScripts: async ({ ids }: any) => ids.forEach((id: string) => registrations.delete(id)),
    executeScript: async (data: any) => { injected.push(data) },
  },
  storage: { onChanged: event(), local: {
    get: async (defaults: any) => ({ ...defaults, customMediumHosts: [...hosts] }),
    set: async (data: any) => { if (data.customMediumHosts) hosts = [...data.customMediumHosts] }, remove: async () => {},
  }, session: { set: async (data: any) => Object.assign(session, data), remove: async (key: string) => { delete session[key] } } },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  declarativeNetRequest: { updateDynamicRules: async () => {}, RuleActionType: {}, HeaderOperation: {}, ResourceType: {} },
}
loadSource('src/background.ts', { chrome }, { './shared/pro': { isPro: async () => false } })
const listener = [...chrome.runtime.onMessage.listeners][0]
const message = async (data: any) => {
  let result: any
  const handled = listener(data, { url: 'chrome-extension://test/popup.html' }, (r: any) => { result = r })
  assert.equal(handled, true, 'background handles custom domain messages asynchronously')
  for (let i = 0; i < 20 && !result; i++) await new Promise(resolve => setImmediate(resolve))
  return result
}
const mode = process.env.CUSTOM_DOMAIN_CASE || 'enable'
if (mode === 'enable') {
  assert.equal((await message({ type: 'enableCustomMediumHost', host, tabId: 7 })).ok, true)
  assert.deepEqual(hosts, [host])
  assert.deepEqual(JSON.parse(JSON.stringify(registrations.get(`me-custom-${host}`))), {
    id: `me-custom-${host}`, matches: [`https://${host}/*`], js: files, runAt: 'document_end', persistAcrossSessions: true,
  })
  assert.deepEqual(JSON.parse(JSON.stringify(injected)), [{ target: { tabId: 7 }, files }])
  assert.equal((await message({ type: 'enableCustomMediumHost', host, tabId: 7 })).ok, true, 'repeated enable is idempotent')
  permitted = false
  assert.equal((await message({ type: 'enableCustomMediumHost', host, tabId: 7 })).ok, false)
  permitted = true
  assert.equal((await message({ type: 'enableCustomMediumHost', host, tabId: 7 })).ok, true, 'a rejected mutation does not poison the queue')
} else if (mode === 'remove') {
  hosts = [host]
  registrations.set(`me-custom-${host}`, { id: `me-custom-${host}` })
  assert.equal((await message({ type: 'removeCustomMediumHost', host })).ok, true)
  assert.deepEqual(hosts, [])
  assert.equal(await chrome.permissions.contains({ origins: [`https://${host}/*`] }), false)
  assert.equal(registrations.size, 0)
} else if (mode === 'feeds') {
  hosts = [host]
  listener({ type: 'pageReport', signals: { authorProfileLinks: [{ href: 'https://medium.com/@hxzhouh/following?source=x', score: 1 }] } },
    { tab: { id: 7, url }, url, frameId: 0 }, () => {})
  await new Promise(resolve => setImmediate(resolve))
  assert.ok(session.feeds_7, 'custom domain page reports must store computed feeds')
  assert.deepEqual(JSON.parse(JSON.stringify(session.feeds_7.feeds)), [
    { name: 'User Feed', url: 'medium.com/feed/@hxzhouh', type: 'user' },
    { name: 'Publication Feed', url: `${host}/feed`, type: 'publication' },
  ])
} else if (mode === 'concurrent') {
  // Both enables start before either completes; async reads snapshot the list.
  const results = await Promise.all([
    message({ type: 'enableCustomMediumHost', host, tabId: 7 }),
    message({ type: 'enableCustomMediumHost', host: 'second.test', tabId: 8 }),
  ])
  assert.ok(results.every(result => result.ok))
  assert.deepEqual([...hosts].sort(), [host, 'second.test'].sort(), 'concurrent enables retain both hosts')
  await Promise.all([
    message({ type: 'removeCustomMediumHost', host }),
    message({ type: 'enableCustomMediumHost', host: 'second.test', tabId: 8 }),
  ])
  assert.deepEqual(hosts, ['second.test'], 'enable cannot resurrect a concurrent removal')
  assert.equal(registrations.has(`me-custom-${host}`), false)
} else if (mode === 'reconcile') {
  hosts = [host]
  registrations.set('me-custom-stale.test', { id: 'me-custom-stale.test' })
  await [...chrome.runtime.onInstalled.listeners][0]({ reason: 'update', previousVersion: '0.0.0' })
  for (let i = 0; i < 50; i++) await new Promise(resolve => setImmediate(resolve)) // reconcile runs in the background
  assert.equal(registrations.has(`me-custom-${host}`), true)
  assert.equal(registrations.has('me-custom-stale.test'), false)
  permitted = false
  await [...chrome.runtime.onInstalled.listeners][0]({ reason: 'update', previousVersion: '0.0.0' })
  for (let i = 0; i < 50; i++) await new Promise(resolve => setImmediate(resolve)) // reconcile runs in the background
  assert.equal(registrations.size, 0, 'no registration without current permission')
}
console.log(`PASS custom domains ${mode}`)
