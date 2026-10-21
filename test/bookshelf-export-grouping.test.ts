import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'
let copied = 0
class CountedMap extends Map {
  set(key: any, value: any) {
    const iterator = value[Symbol.iterator]
    value[Symbol.iterator] = function* () { for (const entry of iterator.call(this)) { copied++; yield entry } }
    return super.set(key, value)
  }
}
const { exportFiles, exportMarkdown } = loadSource('src/shared/bookshelf-export.ts', { Map: CountedMap })
const items = ['a', 'b'].map(key => ({ key, title: key, url: 'https://medium.com/p/abcdef123456', author: '', publication: '', subtitle: '', savedAt: 1, tags: [] }))
const highlights = Array.from({ length: 100 }, (_, i) => ({ itemKey: i % 3 ? 'a' : 'b', text: `quote ${i}` }))
const files = exportFiles(items, highlights, true)
assert.deepEqual(Array.from(files, (f: any) => f.content), items.map(item => exportMarkdown(item, highlights, true)), 'item and quote order preserved')
assert.ok(copied <= highlights.length, `grouping copied ${copied} entries; must be linear`)
console.log('PASS export grouping preserves output with linear entry visits')
