import assert from "node:assert/strict"

try {
  const { selectSubtitle } = await import("../src/shared/markdown-content.ts")
  const candidates = [{ text: "Opening paragraph" }, { text: "A heading" }]
  assert.equal(
    selectSubtitle("example.com", candidates, "Title", "description"),
    ""
  )
  assert.equal(
    selectSubtitle("medium.com.evil.test", candidates, "Title", "description"),
    ""
  )
  assert.equal(
    selectSubtitle("medium.com", candidates, "Title", ""),
    ""
  )
  assert.equal(
    selectSubtitle("writer.medium.com", candidates, "Title", ""),
    ""
  )
  assert.equal(
    selectSubtitle(
      "custom.pub",
      [{ text: "Subtitle", mediumSubtitle: true }],
      "Title",
      ""
    ),
    "Subtitle"
  )
  assert.equal(selectSubtitle("medium.com", [{ text: "Jane Doe" }, { text: "Opening body text" }], "Title", "Opening body text"), "", "a story with no explicit subtitle exports none")
  console.log(
    "PASS Subtitle detection limited to Medium hosts or Medium subtitle structure"
  )
} catch (error) {
  console.error("FAIL Subtitle detection:", error)
  process.exit(1)
}

// Pinned to the live layout: on 2026-10-19 Medium's story subtitle was
// <h2 class="pw-subtitle-paragraph">, and neither older marker was on the page.
// Without it every Medium export loses its subtitle.
{
  const { MEDIUM_SUBTITLE_SELECTOR } = await import('../src/shared/markdown-content.ts')
  const parts = MEDIUM_SUBTITLE_SELECTOR.split(',').map((part: string) => part.trim())
  if (!parts.includes('.pw-subtitle-paragraph')) throw new Error('subtitle selector misses .pw-subtitle-paragraph')
}
