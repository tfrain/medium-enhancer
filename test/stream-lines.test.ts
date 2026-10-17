import assert from "node:assert/strict"

try {
  const { readStreamLines } = await import("../src/shared/stream-lines.ts")
  const bytes = new TextEncoder().encode('data: 你好\r\n\n{"done":true}\n尾行')
  const stream = new ReadableStream({
    start(controller) {
      for (const byte of bytes) controller.enqueue(new Uint8Array([byte]))
      controller.close()
    }
  })
  const lines = []
  for await (const line of readStreamLines(stream)) lines.push(line)
  assert.deepEqual(lines, ["data: 你好", "", '{"done":true}', "尾行"])
  const empty = new ReadableStream({
    start(c) {
      c.close()
    }
  })
  const emptyLines = []
  for await (const line of readStreamLines(empty)) emptyLines.push(line)
  assert.deepEqual(emptyLines, [])
  let cancelled = false
  const endless = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode("one\ntwo\n"))
    },
    cancel() {
      cancelled = true
    }
  })
  for await (const line of readStreamLines(endless)) {
    assert.equal(line, "one")
    break
  }
  assert.ok(cancelled)
  console.log(
    "PASS stream lines: split UTF-8, CRLF, empty lines, EOF tail and cancellation"
  )
} catch (error) {
  console.error("FAIL stream lines:", error)
  process.exit(1)
}
