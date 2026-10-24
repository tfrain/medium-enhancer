import assert from 'node:assert/strict'
import { loadSource, event } from './load-source.ts'
const states: any[] = []
let cursor = 0
const effects: (() => any)[] = []
let initial = true
const React = {
  useState: (value: any) => { const i = cursor++; if (!(i in states)) states[i] = value; return [states[i], (next: any) => { states[i] = next }] },
  useEffect: (fn: any) => { if (initial) effects.push(fn) },
}
const jsx = (type: any, props: any) => ({ type, props })
const calls: string[] = []
let customHosts: string[] = []
let inspections = 0
let inspectedPage = { isMediumStory: true, feeds: ['https://pub.huizhou92.com/feed', 'https://medium.com/feed/@hxzhouh'] }
let grant: (ok: boolean) => void
const chrome = {
  tabs: { query: (_q: any, cb: any) => cb([{ id: 7, url: 'https://pub.huizhou92.com/story-b61d5eda73ec' }]) },
  storage: { onChanged: event(), local: { get: (defaults: any, cb?: any) => {
    if (cb) cb(defaults)
    return Promise.resolve({ ...defaults, customMediumHosts: customHosts })
  } }, session: { get: (_keys: any, cb: any) => cb({ feeds_7: { url: 'https://pub.huizhou92.com/story-b61d5eda73ec', feeds: [{ name: 'Publication Feed', url: 'pub.huizhou92.com/feed', type: 'publication' }] } }) } },
  scripting: { executeScript: async () => { inspections++; return [{ result: inspectedPage }] } },
  permissions: { request: (data: any) => { calls.push('permission'); assert.equal(JSON.stringify(data), '{"origins":["https://pub.huizhou92.com/*"]}'); return new Promise<boolean>(resolve => { grant = resolve }) } },
  runtime: { sendMessage: async (data: any) => { calls.push('message'); assert.equal(JSON.stringify(data), '{"type":"enableCustomMediumHost","host":"pub.huizhou92.com","tabId":7}'); return { ok: true } } },
}
const { default: Popup } = loadSource('src/popup.tsx', { chrome }, {
  react: React, 'react/jsx-runtime': { jsx, jsxs: jsx }, './popup.css': {},
  './components/bookshelf-popup': { BookshelfPopup: () => null },
  './shared/obsidian-clip': {}, './shared/markdown-download': {}, './shared/injection': {},
  './shared/theme': { applyPageTheme: () => {} },
})
const render = () => { cursor = 0; const tree = Popup(); initial = false; return tree }
const nodes = (tree: any): any[] => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)]
render()
for (const effect of effects) effect()
await new Promise(resolve => setImmediate(resolve))
let tree = render()
const feeds = nodes(tree).filter(n => n.props?.feed).map(n => n.props.feed.type)
assert.deepEqual(feeds, ['publication', 'user'], 'fallback feeds have distinct publication/author cards')
const button = nodes(tree).find(n => n.type === 'button' && String(n.props.children).includes('Enable Medium Enhancer'))
assert.ok(button, 'unknown Medium story offers enable')
const pending = button.props.onClick()
assert.deepEqual(calls, ['permission'], 'request happens synchronously in click, before await or message')
grant!(false)
await pending
assert.deepEqual(calls, ['permission'], 'denial does not message background')
const success = button.props.onClick()
grant!(true)
await success
assert.deepEqual(calls, ['permission', 'permission', 'message'])
tree = render()
assert.equal(nodes(tree).some(n => n.type === 'button' && String(n.props.children).includes('Enable Medium Enhancer')), false)
console.log('PASS custom domain popup feed types, click permission order, denial and enable')

const remount = async () => {
  states.length = 0
  effects.length = 0
  initial = true
  render()
  for (const effect of effects) effect()
  await new Promise(resolve => setImmediate(resolve))
  return render()
}
customHosts = ['pub.huizhou92.com']
tree = await remount()
assert.equal(inspections, 1, 'enabled hosts use stored feeds, no fallback inspection')
assert.equal(nodes(tree).some(n => n.type === 'button' && String(n.props.children).includes('Enable Medium Enhancer')), false)
assert.equal(nodes(tree).filter(n => n.props?.feed).length, 1)
customHosts = []
inspectedPage = { isMediumStory: false, feeds: [] }
tree = await remount()
assert.equal(nodes(tree).some(n => n.type === 'button' && String(n.props.children).includes('Enable Medium Enhancer')), false, 'ordinary pages cannot enable Medium features')
assert.equal(nodes(tree).filter(n => n.props?.feed).length, 0)
console.log('PASS popup enabled-host classification and ordinary-page rejection')
