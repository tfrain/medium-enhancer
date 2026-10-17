import assert from "node:assert/strict"
import { shouldOpenArticleOnUpdate, ARTICLE_URL } from "../src/shared/whats-new.ts"

try {
  const upd = (previousVersion?: string) => ({ reason: "update", previousVersion })
  assert.equal(shouldOpenArticleOnUpdate(upd("0.7.2"), "0.8.3"), true, "0.7 -> 0.8 opens")
  assert.equal(shouldOpenArticleOnUpdate(upd("0.8.2"), "0.8.3"), false, "patch does not open")
  assert.equal(shouldOpenArticleOnUpdate(upd("0.8.3"), "1.0.0"), true, "major opens")
  assert.equal(shouldOpenArticleOnUpdate(upd(undefined), "0.8.3"), false, "no previous version")
  assert.equal(shouldOpenArticleOnUpdate({ reason: "install" }, "0.8.3"), false, "install opens Options, not the article")
  assert.equal(shouldOpenArticleOnUpdate({ reason: "chrome_update", previousVersion: "0.7.0" }, "0.8.3"), false, "Chrome's own update")
  assert.match(ARTICLE_URL, /f06012a2780c$/)
  console.log("PASS article opens after a major.minor update only")
} catch (error) {
  console.error("FAIL whats-new:", error)
  process.exit(1)
}
