// Fault-injection test for shared/injection.ts and shared/site-access.ts with
// mocked chrome APIs. Run: node test/injection.test.ts
let alive = false
const calls: string[] = []
;(globalThis as any).chrome = {
  runtime: { lastError: undefined, getManifest: () => ({ content_scripts: [{ js: ['contents.js'], css: ['contents.css'] }] }) },
  tabs: { sendMessage: (_id: number, msg: any, cb: (r: any) => void) => { calls.push('msg:' + msg.type); cb(msg.type === 'me-ping' ? (alive ? { ok: true } : undefined) : { ok: true, got: msg.type }) } },
  scripting: {
    insertCSS: async (o: any) => { calls.push('css:' + o.files.join(',')) },
    executeScript: async (o: any) => { calls.push('js:' + o.files.join(',')); alive = true },
  },
}
const { sendToTab } = await import('../src/shared/injection.ts')
const { allowlistToMatchPatterns, extraAllowlistPatterns, ollamaPermissionPattern, DEFAULT_SITE_ALLOWLIST } = await import('../src/shared/site-access.ts')
const ok = (name: string, cond: boolean, extra = '') => console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : ''))

let r: any = await sendToTab(1, { type: 'showSummaryPanel' })
ok('no script yet -> inject css+js, then send', calls.join('|') === 'msg:me-ping|css:contents.css|js:contents.js|msg:showSummaryPanel' && r?.got === 'showSummaryPanel', calls.join('|'))
calls.length = 0
r = await sendToTab(1, { type: 'clipPageAsMarkdown' })
ok('script present -> no second injection', calls.join('|') === 'msg:me-ping|msg:clipPageAsMarkdown', calls.join('|'))

ok('patterns', JSON.stringify(allowlistToMatchPatterns(['medium.com', '*.itnext.io', 'https://example.org/path', 'bad host!'])) ===
  JSON.stringify(['https://medium.com/*', 'https://*.itnext.io/*', 'https://example.org/*']))
ok('defaults need no extra permission', extraAllowlistPatterns(DEFAULT_SITE_ALLOWLIST).length === 0)
ok('a new site needs permission', JSON.stringify(extraAllowlistPatterns([...DEFAULT_SITE_ALLOWLIST, 'example.org'])) === '["https://example.org/*"]')
ok('local Ollama needs nothing', ollamaPermissionPattern('http://localhost:11434') === null && ollamaPermissionPattern('http://127.0.0.1:11434') === null)
ok('remote Ollama asks for its host', ollamaPermissionPattern('http://192.168.1.20:11434') === 'http://192.168.1.20/*')
