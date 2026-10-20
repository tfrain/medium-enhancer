import assert from 'node:assert/strict'
import { loadSource, event } from './load-source.ts'

const chrome = {
  runtime: { onMessage: event(), onConnect: event(), onStartup: event(), onInstalled: event(), onUpdateAvailable: event() },
  tabs: { onUpdated: event(), onRemoved: event(), onActivated: event() },
  windows: { onFocusChanged: event() },
  storage: { onChanged: event(), local: { get: async () => { throw new Error('Storage unavailable') } } },
  commands: { onCommand: event() }, contextMenus: { onClicked: event() },
}
try {
  loadSource('src/background.ts', { chrome, AbortController })
  const messages: any[] = []
  let disconnected = false
  const port = { name: 'summarize', onDisconnect: event(), onMessage: event(), postMessage: (message: any) => messages.push(message), disconnect: () => { disconnected = true } }
  chrome.runtime.onConnect.emit(port)
  await [...port.onMessage.listeners][0]({ instruction: 'Summarize', text: 'Story', baseUrl: 'http://localhost:11434' })
  assert.equal(messages.length, 1)
  assert.equal(messages[0].type, 'error')
  assert.match(messages[0].error, /settings/i)
  assert.equal(disconnected, true)
  console.log('PASS background settings-read failure is reported over the AI port')
} catch (error) {
  console.error('FAIL background settings:', error)
  process.exit(1)
}
