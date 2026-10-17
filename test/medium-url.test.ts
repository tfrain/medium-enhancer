import assert from "node:assert/strict"

try {
  const { classifyMediumUrl } = await import("../src/shared/medium-url.ts")
  for (const [url, expected] of [
    ["https://medium.com/@a/story-abcdef123456?x=1", "article"],
    ["https://a.medium.com/story-abcdef123456", "article"],
    ["https://itnext.io/story-abcdef123456", "article"],
    ["https://medium.com/@a", "profile"],
    ["https://a.medium.com/", "publication"],
    ["https://medium.com/my-publication", "publication"],
    ["https://itnext.io/", "publication"],
    ["https://example.com/story-abcdef123456", null],
    ["https://medium.com.evil.test/story-abcdef123456", null],
    ["https://example.com/@a", null],
    ["https://medium.com/new-story", null],
    ["https://medium.com/p/abcdef123456/edit", null],
    ["https://medium.com/search?q=story-abcdef123456", null],
    ["garbage", null]
  ])
    assert.equal(classifyMediumUrl(url!), expected, String(url))
  console.log("PASS Medium URL classification and custom publication domains")
} catch (error) {
  console.error("FAIL Medium URL classification:", error)
  process.exit(1)
}
