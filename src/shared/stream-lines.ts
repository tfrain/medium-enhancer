// Decode incrementally so UTF-8 split across chunks and a final line without
// a newline are both preserved. Consumers retain their own protocol parsing.
export async function* readStreamLines(
  stream: ReadableStream<Uint8Array>
): AsyncGenerator<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let ended = false
  try {
    while (true) {
      const { value, done } = await reader.read()
      buffer += done
        ? decoder.decode()
        : decoder.decode(value, { stream: true })
      let index: number
      while ((index = buffer.indexOf("\n")) >= 0) {
        yield buffer.slice(0, index).replace(/\r$/, "")
        buffer = buffer.slice(index + 1)
      }
      if (done) {
        ended = true
        if (buffer) yield buffer.replace(/\r$/, "")
        return
      }
    }
  } finally {
    if (!ended) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
