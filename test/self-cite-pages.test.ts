import assert from "node:assert/strict"

// Cite My Story must see every story, not only the first page of top earners.
try {
  const afters: string[] = []
  const node = (title: string, url: string, units: number) =>
    ({ node: { title, mediumUrl: url, firstPublishedAt: 0, earnings: { total: { units, nanos: 0 } }, collection: null } })
  ;(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
    const v = JSON.parse(String(init.body))[0].variables
    afters.push(v.after)
    const page = v.after === ""
      ? { edges: [node("Big earner", "https://medium.com/p/a", 90), node("Dup", "https://medium.com/p/d", 5)], pageInfo: { endCursor: "c1", hasNextPage: true } }
      : { edges: [node("Dup", "https://medium.com/p/d", 5), node("Medium Stats Insights 1.1.2", "https://medium.com/p/s", 0)], pageInfo: { endCursor: "c2", hasNextPage: false } }
    return { ok: true, json: async () => [{ data: { user: { postsConnection: page } } }] }
  }
  const { fetchAllStories, scoreRelevance } = await import("../src/contents/lib/self-cite.ts")
  const all = await fetchAllStories("paged-writer")
  assert.deepEqual(afters, ["", "c1"])
  assert.equal(all.length, 3, "dedupes by URL")
  const best = all
    .map((p: any) => ({ ...p, r: scoreRelevance("Medium Stats Insights 1.2", p.title) }))
    .sort((a: any, b: any) => b.r - a.r)[0]
  assert.equal(best.url, "https://medium.com/p/s", "low-earning but on-topic story is found")
  console.log("PASS Cite My Story pages through every story and finds a low-earning on-topic one")
} catch (error) {
  console.error("FAIL Cite My Story paging:", error)
  process.exit(1)
}

// The story being edited must not be suggested to itself.
import("../src/contents/lib/self-cite.ts").then(({ editingPostId, isSamePost }) => {
  try {
    const id = editingPostId("/p/e5f2a1b3c4d6/edit")
    assert.equal(id, "e5f2a1b3c4d6")
    assert.equal(editingPostId("/new-story"), null)
    assert.ok(isSamePost("https://medium.com/programmers-career/your-bash-script-sorts-e5f2a1b3c4d6?source=x", id))
    assert.ok(isSamePost("https://medium.com/p/e5f2a1b3c4d6", id))
    assert.ok(!isSamePost("https://medium.com/programmers-career/other-story-0123456789ab", id))
    assert.ok(!isSamePost("https://medium.com/p/e5f2a1b3c4d6", null))
    console.log("PASS Cite My Story leaves out the story being edited")
  } catch (error) {
    console.error("FAIL Cite My Story self-exclusion:", error)
    process.exit(1)
  }
})
