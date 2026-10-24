import assert from 'node:assert/strict'
import { loadSource, event } from './load-source.ts'

class Element extends EventTarget {
  id = ''
  className = ''
  textContent = ''
  style: Record<string, string> = {}
  children: Element[] = []
  parent: Element | null = null
  disabled = false
  attributes: Record<string, string> = {}
  setAttribute(name: string, value: string) { this.attributes[name] = value }
  classList = { add() {}, remove() {}, contains: () => false, toggle() {} }
  appendChild(child: Element) { this.children.push(child); child.parent = this; return child }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this) }
}
const body = new Element()
const documentElement = new Element()
const find = (root: Element, test: (node: Element) => boolean): Element | undefined =>
  test(root) ? root : root.children.map(child => find(child, test)).find(Boolean)
const document = { body, documentElement, createElement: () => new Element(), getElementById: (id: string) => find(body, node => node.id === id) || find(documentElement, node => node.id === id) }
const windowListeners = new Map<string, Set<any>>()
const window = {
  innerWidth: 1200,
  addEventListener: (type: string, fn: any) => { if (!windowListeners.has(type)) windowListeners.set(type, new Set()); windowListeners.get(type)!.add(fn) },
  removeEventListener: (type: string, fn: any) => windowListeners.get(type)?.delete(fn),
}
const ports: any[] = []
const reads: ((value: any) => void)[] = []
let settingsFail = false
const chrome = {
  storage: { local: { get: () => settingsFail ? Promise.reject(new Error('Storage unavailable')) : new Promise(resolve => reads.push(resolve)) } },
  runtime: { connect: () => {
    const port = { onMessage: event(), onDisconnect: event(), postMessage() {}, disconnect() { port.onDisconnect.emit() } }
    ports.push(port)
    return port
  } },
}
const { showAiPanel, disposePanel } = loadSource('src/contents/ui/summary-panel.ts', { document, window, chrome })
const request = (headline: string) => ({ headline, instruction: 'Summarize', articleText: 'Story text', articleTitle: 'Story' })
const settings = { aiProvider: 'ollama', ollamaModel: 'test-model' }
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }
const status = () => find(body, node => node.className === 'me-sum-status')?.textContent || ''
try {
  const older = showAiPanel(request('Older'))
  const newer = showAiPanel(request('Newer'))
  // The AI settings read is shared; translation settings reads resolve in reverse order.
  reads[0](settings)
  reads[2]({ translationLanguage: '' })
  await newer
  reads[1]({ translationLanguage: '' })
  await older
  assert.ok(find(body, node => node.textContent === 'Newer'), 'latest request owns the panel')
  assert.equal(find(body, node => node.textContent === 'Older'), undefined, 'late settings must not replace it')
  const previousPort = ports.at(-1)
  const replacement = showAiPanel(request('Replacement'))
  reads.at(-2)!(settings)
  reads.at(-1)!({ translationLanguage: '' })
  await replacement
  previousPort.onMessage.emit({ type: 'chunk', chunk: 'Previous story output' })
  assert.equal(find(body, node => node.textContent === 'Previous story output'), undefined)
  assert.match(status(), /Connecting/)
  ports.at(-1).onDisconnect.emit()
  await tick()
  assert.match(status(), /error.*disconnect/i, 'unexpected disconnect reports an error')
  assert.equal(windowListeners.get('mousemove')?.size, 1)
  disposePanel()
  assert.equal(windowListeners.get('mousemove')?.size, 0, 'drag listener removed')
  assert.equal(windowListeners.get('mouseup')?.size, 0, 'drag listener removed')
  const pending = showAiPanel(request('After navigation'))
  disposePanel()
  reads.at(-2)!(settings)
  reads.at(-1)!({ translationLanguage: '' })
  await pending
  assert.equal(body.children.length, 0, 'navigation invalidates pending panel creation')
  const next = showAiPanel(request('Current'))
  reads.at(-2)!(settings)
  reads.at(-1)!({ translationLanguage: '' })
  await next
  const oldPort = ports.at(-1)
  find(body, node => node.textContent === 'Regenerate')!.dispatchEvent(new Event('click'))
  oldPort.onMessage.emit({ type: 'chunk', chunk: 'Obsolete result' })
  assert.equal(find(body, node => node.textContent === 'Obsolete result'), undefined, 'cancelled stream cannot update the panel')
  ports.at(-1).onMessage.emit({ type: 'chunk', chunk: 'Current result' })
  ports.at(-1).onMessage.emit({ type: 'done' })
  await tick()
  assert.ok(find(body, node => node.textContent === 'Current result'))
  assert.equal(status(), 'Done.')
  disposePanel()
  settingsFail = true
  await showAiPanel(request('Storage error'))
  assert.match(status(), /error.*settings/i, 'settings rejection is visible')
  disposePanel()
  console.log('PASS summary request races, navigation disposal, drag cleanup, cancellation and disconnect errors')
} catch (error) {
  console.error('FAIL summary panel:', error)
  process.exit(1)
}
