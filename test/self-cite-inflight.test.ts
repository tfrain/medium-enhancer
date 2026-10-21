import assert from 'node:assert/strict'
import { loadSource } from './load-source.ts'
const requests: { username: string; after: string; resolve: (v: any) => void }[] = []
const { fetchAllStories } = loadSource('src/contents/lib/self-cite.ts', {
  fetch: (_url: string, init: any) => new Promise(resolve => requests.push({ ...JSON.parse(init.body)[0].variables, resolve })),
})
const respond = (index: number, next = false) => {
  const connection = {
    edges: [{ node: { title: requests[index].username, mediumUrl: `https://medium.com/${requests[index].username}/${index}` } }],
    pageInfo: { hasNextPage: next, endCursor: next ? 'page2' : '' },
  }
  requests[index].resolve({ ok: true, json: async () => ({ data: { user: { postsConnection: connection } } }) })
}
const tick = () => new Promise(resolve => setImmediate(resolve))
const a = fetchAllStories('alice')
const a2 = fetchAllStories('alice')
const b = fetchAllStories('bob')
assert.equal(requests.length, 2, 'same username shares first page; different username is independent')
respond(0, true)
respond(1)
await tick()
assert.equal(requests.length, 3, 'only one second page requested')
assert.equal(requests[2].after, 'page2')
respond(2)
const [one, two, other] = await Promise.all([a, a2, b])
assert.deepEqual(one, two)
assert.equal(one.length, 2)
assert.equal(other[0].title, 'bob')
const failed = fetchAllStories('retry')
const failed2 = fetchAllStories('retry')
const rejected = Promise.all([assert.rejects(failed, /failed/), assert.rejects(failed2, /failed/)])
assert.equal(requests.length, 4)
requests[3].resolve({ ok: false, status: 500 })
await rejected
const retry = fetchAllStories('retry')
assert.equal(requests.length, 5, 'failed promise removed so retry can request again')
respond(4)
await retry
await fetchAllStories('retry')
assert.equal(requests.length, 5, 'successful result remains cached')
console.log('PASS per-user in-flight pagination sharing, isolation, failure cleanup and cache')
