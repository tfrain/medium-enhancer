import assert from 'node:assert/strict'
import { event, loadSource } from './load-source.ts'
let pro = false
let bookshelfEnabled = true
let customMediumHosts: string[] = []
let activeUrl = 'https://medium.com/@writer/story-abcdef123456'
const menus = new Map<string, any>()
const sent: any[] = []
const toasts: any[] = []
const chrome = {
  runtime: { onMessage: event(), onConnect: event(), onStartup: event(), onInstalled: event(), onUpdateAvailable: event(), lastError: undefined },
  tabs: { onUpdated: event(), onRemoved: event(), onActivated: event(),
    query: (_query: any, callback: any) => callback([{ id: 5, url: activeUrl }]),
    sendMessage: async (_id: number, message: any) => { toasts.push(message) },
  },
  windows: { onFocusChanged: event() },
  storage: { onChanged: event(), local: { get: async (defaults: any) => ({ ...defaults, bookshelfEnabled, customMediumHosts }) }, session: { set: async () => {}, remove: async () => {} } },
  action: { setBadgeText: async () => {}, setBadgeBackgroundColor: async () => {} },
  commands: { onCommand: event() },
  contextMenus: {
    onClicked: event(), removeAll: async () => menus.clear(),
    create: (menu: any) => { menus.set(menu.id, { ...menu }) },
    update: (id: string, changes: any, callback: any) => { if (menus.has(id)) Object.assign(menus.get(id), changes); callback() },
  },
  declarativeNetRequest: { updateDynamicRules: async () => {}, RuleActionType: {}, HeaderOperation: {}, ResourceType: {} },
}
loadSource('src/background.ts', { chrome }, {
  './shared/pro': { isPro: async () => pro },
  './shared/injection': { sendToTab: async (id: number, message: any) => { sent.push({ id, ...message }); return { ok: true } } },
})
const flush = () => new Promise(resolve => setImmediate(resolve))
// Update latency (2026-10-20): no browser-wide tab/window listeners may wake the
// worker, and a downloaded update must install without waiting for idle.
for (const [name, ev] of Object.entries({ 'tabs.onUpdated': chrome.tabs.onUpdated, 'tabs.onActivated': chrome.tabs.onActivated, 'tabs.onRemoved': chrome.tabs.onRemoved, 'windows.onFocusChanged': chrome.windows.onFocusChanged })) {
  assert.equal(ev.listeners.size, 0, `${name} must not be registered`)
}
assert.equal(chrome.runtime.onUpdateAvailable.listeners.size, 1, 'onUpdateAvailable reloads the extension')
chrome.runtime.onStartup.emit()
await flush()
assert.equal(menus.get('bookshelf_save_menu').visible, true)
assert.equal(menus.get('bookshelf_highlight_menu').enabled, false)
assert.match(menus.get('bookshelf_highlight_menu').title, /Pro/)
chrome.contextMenus.onClicked.emit({ menuItemId: 'bookshelf_save_menu', pageUrl: activeUrl }, { id: 5, url: activeUrl })
await flush()
assert.equal(sent.at(-1).type, 'saveToBookshelf')
assert.equal(toasts.at(-1).type, 'showExportToast')
pro = true
chrome.storage.onChanged.emit({ enhancerProUnlocked: { newValue: true } }, 'local')
await flush()
assert.equal(menus.get('bookshelf_highlight_menu').enabled, true)
chrome.contextMenus.onClicked.emit({ menuItemId: 'bookshelf_highlight_menu', pageUrl: activeUrl, selectionText: 'Selected words' }, { id: 5, url: activeUrl })
await flush()
assert.equal(sent.at(-1).type, 'highlightToBookshelf')
assert.equal(sent.at(-1).selectionText, 'Selected words')
activeUrl = 'https://medium.com/@writer'
// The content script reports in-tab navigation and the tab becoming visible.
chrome.runtime.onMessage.emit({ type: 'pageReport', signals: {} }, { tab: { id: 5, active: true, url: activeUrl }, url: activeUrl, frameId: 0 }, () => {})
await flush()
assert.equal(menus.get('bookshelf_save_menu').visible, false)
assert.equal(menus.get('bookshelf_highlight_menu').visible, false)
bookshelfEnabled = false
activeUrl = 'https://medium.com/p/abcdef123456'
chrome.storage.onChanged.emit({ bookshelfEnabled: { newValue: false } }, 'local')
await flush()
assert.equal(menus.get('bookshelf_save_menu').visible, false)
assert.equal(menus.get('quote_card_menu').visible, true, 'independent quote-card menu remains available')
console.log('PASS Bookshelf context-menu registration, story visibility, live toggle/Pro gates and save/highlight dispatch')

bookshelfEnabled = true
customMediumHosts = ['pub.huizhou92.com']
activeUrl = 'https://pub.huizhou92.com/story-b61d5eda73ec'
chrome.storage.onChanged.emit({ customMediumHosts: { newValue: customMediumHosts } }, 'local')
await flush()
assert.ok(menus.get('bookshelf_save_menu').documentUrlPatterns.includes('https://pub.huizhou92.com/*'))
assert.equal(menus.get('bookshelf_save_menu').visible, true)
console.log('PASS custom domain context-menu patterns and visibility')
