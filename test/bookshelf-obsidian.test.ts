import assert from 'node:assert/strict'
import { loadSource, event } from './load-source.ts'
const libraryUrl = 'chrome-extension://test/tabs/bookshelf.html'
let copied = ''
let sent: any
let navigated: any
const chrome: any = {
  runtime: { getURL: (p: string) => 'chrome-extension://test/' + p,
    sendMessage: async (message: any) => { sent = message; return { ok: true, filepath: 'clippers/Story.md' } },
    onMessage: event(), onConnect: event(), onStartup: event(), onInstalled: event(),
  },
  tabs: { getCurrent: async () => ({ id: 9 }), get: async () => ({ id: 9, url: libraryUrl }),
    update: async (id: number, options: any) => { navigated = { id, ...options } }, onUpdated: event(), onRemoved: event(), onActivated: event() },
  windows: { onFocusChanged: event() }, storage: { onChanged: event(), local: { get: (defaults: any, callback: any) => callback(defaults) } },
  commands: { onCommand: event() }, contextMenus: { onClicked: event() },
}
const { sendClipToObsidian } = loadSource('src/shared/obsidian-clip.ts', {
  chrome, window: { location: { href: libraryUrl } }, navigator: { clipboard: { writeText: async (text: string) => { copied = text } } },
})
await sendClipToObsidian({ title: 'Story', markdown: 'Short note' })
assert.equal(sent.libraryTabId, 9)
assert.equal(sent.clipboardReady, false)
assert.equal(copied, '')
const long = 'Long article '.repeat(2000)
await sendClipToObsidian({ title: 'Story', markdown: long })
assert.equal(sent.clipboardReady, true)
assert.equal(copied, long, 'large library exports use the extension-page clipboard')
loadSource('src/background.ts', { chrome })
const response = await new Promise<any>(resolve => {
  for (const listener of chrome.runtime.onMessage.listeners) listener(sent, { url: libraryUrl }, resolve)
})
assert.equal(response.ok, true)
assert.equal(response.transport, 'clipboard')
assert.equal(navigated.id, 9)
assert.ok(navigated.url.startsWith('obsidian://adv-uri?'))
assert.ok(navigated.url.includes('clipboard=true'))
chrome.tabs.get = async () => ({ id: 9, url: 'https://example.com' })
const rejected = await new Promise<any>(resolve => {
  for (const listener of chrome.runtime.onMessage.listeners) listener(sent, { url: libraryUrl }, resolve)
})
assert.equal(rejected.ok, false, 'a navigated/replaced library tab cannot be hijacked')
console.log('PASS Bookshelf Obsidian direct/clipboard transport and validated extension-tab handoff')
