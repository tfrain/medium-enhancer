import assert from "node:assert/strict"

try {
  let payload: any
  let request: RequestInit | undefined
  let response: any
  ;(globalThis as any).fetch = async (_url: string, init: RequestInit) => {
    request = init
    payload = JSON.parse(String(init.body))[0]
    return { ok: true, json: async () => response }
  }
  const { fetchViewerUsername, fetchTopEarners } = await import(
    "../src/contents/lib/self-cite.ts"
  )
  response = [{ data: { viewer: { id: "id", username: "current-writer" } } }]
  assert.equal(await fetchViewerUsername(), "current-writer")
  assert.equal(payload.query, "query ViewerQuery { viewer { id username } }")
  assert.equal(request?.credentials, "include")
  response = [{ data: { viewer: null } }]
  await assert.rejects(fetchViewerUsername(), /Sign in to Medium/)
  response = [{ errors: [{ message: "Session expired" }] }]
  await assert.rejects(fetchViewerUsername(), /Session expired/)
  await assert.rejects(fetchTopEarners("current-writer"), /Session expired/)
  assert.equal(payload.variables.username, "current-writer")
  response = [{ data: { user: { postsConnection: { edges: [] } } } }]
  assert.deepEqual(await fetchTopEarners("current-writer"), [])
  console.log(
    "PASS Cite My Story uses the current viewer and distinguishes sign-in/errors from empty stories"
  )
} catch (error) {
  console.error("FAIL Cite My Story:", error)
  process.exit(1)
}
