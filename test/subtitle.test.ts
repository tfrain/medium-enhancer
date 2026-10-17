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
    "Opening paragraph"
  )
  assert.equal(
    selectSubtitle("writer.medium.com", candidates, "Title", ""),
    "Opening paragraph"
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
  console.log(
    "PASS Subtitle detection limited to Medium hosts or Medium subtitle structure"
  )
} catch (error) {
  console.error("FAIL Subtitle detection:", error)
  process.exit(1)
}
