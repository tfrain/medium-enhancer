import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'

let upgrade: any[] = []
let closed = 0
let lastTx: any
let openFailure = false
let blocked = false
let put: any
const db = {
  createObjectStore: (name: string, options: any) => {
    upgrade.push([name, options])
    return { createIndex: (name: string, key: string) => upgrade.push([name, key]) }
  },
  close: () => closed++,
  transaction: () => {
    const request = (value: any) => {
      const req: any = { result: value }
      queueMicrotask(() => req.onsuccess?.())
      return req
    }
    const tx: any = {
      objectStore: () => ({ get: () => request({ key: 'story', savedAt: 123 }), put: (value: any) => { put = value; return request('story') } }),
      abort: () => queueMicrotask(() => tx.onabort?.()),
    }
    lastTx = tx
    return tx
  },
}
let opens = 0
const indexedDB = { open: () => {
  opens++
  const request: any = { result: db, error: new Error('Open failed') }
  queueMicrotask(() => {
    if (openFailure) request.onerror()
    else if (blocked) { request.onblocked(); request.onsuccess() }
    else { request.onupgradeneeded({ oldVersion: 0 }); request.onsuccess() }
  })
  return request
} }
const load = () => loadSource('src/shared/bookshelf-db.ts', { indexedDB })
const storage = load()
let settled = false
const read = storage.getBookshelfItem('story').then((value: any) => { settled = true; return value })
await new Promise(resolve => setImmediate(resolve))
assert.equal(settled, false, 'request success must wait for transaction commit')
assert.deepEqual(upgrade.map(row => row[0]), ['items', 'highlights', 'itemKey'])
assert.equal(upgrade[1][1].autoIncrement, true)
lastTx.oncomplete()
assert.equal((await read).savedAt, 123)
upgrade = []
storage.migrateBookshelf(db, 1)
assert.equal(upgrade.length, 0, 'migration does not recreate released stores')
const save = storage.saveBookshelfItem('story', (existing: any) => ({ ...existing, title: 'Updated' }))
await new Promise(resolve => setImmediate(resolve))
assert.equal(put.savedAt, 123)
assert.equal(put.title, 'Updated')
lastTx.error = new Error('Disk full')
lastTx.onabort()
await assert.rejects(() => save, /Disk full/)
await assert.rejects(() => storage.saveBookshelfItem('story', () => { throw new Error('Invalid update') }), /Invalid update/)
assert.equal(opens, 1, 'a successful connection is reused')
db.onversionchange()
assert.equal(closed, 1)
openFailure = true
await assert.rejects(() => storage.getBookshelfItem('story'), /Open failed/)
openFailure = false
const retry = storage.getBookshelfItem('story')
await new Promise(resolve => setImmediate(resolve))
lastTx.oncomplete()
await retry
assert.equal(opens, 3, 'failed opens can be retried')
blocked = true
await assert.rejects(() => load().getBookshelfItem('story'), /Close other Bookshelf tabs/)
assert.equal(closed, 2, 'late open after a blocked rejection must close its connection')
console.log('PASS Bookshelf schema migration, commit waiting, abort/error propagation, connection reuse/retry and blocked-open cleanup')
