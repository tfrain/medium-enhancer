import assert from "node:assert/strict"

try {
  const listeners = new Set<(delta: any) => void>()
  let downloadCallback: (id?: number) => void
  let searchCallback: (items: any[]) => void
  let options: any
  ;(globalThis as any).chrome = {
    runtime: { lastError: undefined },
    downloads: {
      onChanged: {
        addListener: (fn: any) => listeners.add(fn),
        removeListener: (fn: any) => listeners.delete(fn)
      },
      download: (opts: any, cb: any) => {
        options = opts
        downloadCallback = cb
      },
      search: (_query: any, cb: any) => {
        searchCallback = cb
      }
    }
  }
  const { triggerMarkdownDownload } = await import(
    "../src/shared/markdown-download.ts"
  )
  let resolved = false
  const pending = triggerMarkdownDownload("A/B", "# Hello").then((id) => {
    resolved = true
    return id
  })
  downloadCallback!(5)
  searchCallback!([{ state: "in_progress" }])
  await Promise.resolve()
  assert.equal(resolved, false, "starting the download must not report success")
  assert.equal(options.filename, "AB.md")
  assert.equal(options.saveAs, false)
  for (const listener of listeners)
    listener({ id: 6, state: { current: "complete" } })
  await Promise.resolve()
  assert.equal(resolved, false)
  for (const listener of listeners)
    listener({ id: 5, state: { current: "complete" } })
  assert.equal(await pending, 5)
  assert.equal(listeners.size, 0)
  const failed = triggerMarkdownDownload("Title", "text")
  downloadCallback!(7)
  searchCallback!([{ state: "in_progress" }])
  for (const listener of listeners)
    listener({
      id: 7,
      state: { current: "interrupted" },
      error: { current: "FILE_ACCESS_DENIED" }
    })
  await assert.rejects(failed, /FILE_ACCESS_DENIED/)
  assert.equal(listeners.size, 0)
  const fast = triggerMarkdownDownload("Fast", "text")
  downloadCallback!(8)
  searchCallback!([{ state: "complete" }])
  assert.equal(await fast, 8)
  assert.equal(listeners.size, 0)
  const denied = triggerMarkdownDownload("Denied", "text")
  chrome.runtime.lastError = { message: "Downloads disabled" }
  downloadCallback!()
  chrome.runtime.lastError = undefined
  await assert.rejects(denied, /Downloads disabled/)
  assert.equal(listeners.size, 0)
  console.log(
    "PASS Markdown download waits for completion and reports specific failures"
  )
} catch (error) {
  console.error("FAIL Markdown download:", error)
  process.exit(1)
}
