import assert from "node:assert/strict"

try {
  const { migrateLegacyAiSettings, getAiConfig } = await import(
    "../src/shared/ai-defaults.ts"
  )
  const legacy = {
    aiProvider: "openai",
    aiApiKey: "open-secret",
    aiCloudModel: "custom-open"
  }
  const migration = migrateLegacyAiSettings(legacy)
  assert.deepEqual(migration.updates, {
    openaiApiKey: "open-secret",
    openaiModel: "custom-open"
  })
  assert.deepEqual(migration.removeKeys, ["aiApiKey", "aiCloudModel"])
  assert.deepEqual(
    migrateLegacyAiSettings({ ...legacy, aiProvider: "anthropic" }).updates,
    { anthropicApiKey: "open-secret", anthropicModel: "custom-open" }
  )
  assert.deepEqual(
    migrateLegacyAiSettings({ ...legacy, aiProvider: "ollama" }).updates,
    {}
  )
  assert.deepEqual(
    migrateLegacyAiSettings({
      ...legacy,
      openaiApiKey: "new",
      openaiModel: "new-model"
    }).updates,
    {}
  )
  assert.deepEqual(
    migrateLegacyAiSettings({ openaiApiKey: "new" }).removeKeys,
    []
  )
  const stored = {
    ...legacy,
    ...migration.updates,
    anthropicApiKey: "ant-secret",
    anthropicModel: "ant-model"
  }
  assert.equal(getAiConfig(stored, "openai").apiKey, "open-secret")
  assert.equal(getAiConfig(stored, "anthropic").apiKey, "ant-secret")
  assert.equal(getAiConfig(stored, "anthropic").model, "ant-model")
  assert.equal(
    getAiConfig({ aiProvider: "anthropic", openaiApiKey: "open-secret" })
      .apiKey,
    ""
  )
  for (const provider of ["ollama", "openai", "anthropic"])
    assert.ok(getAiConfig({ aiProvider: provider }).model)
  console.log(
    "PASS AI settings migration, provider isolation and first-use defaults"
  )
} catch (error) {
  console.error("FAIL AI settings migration:", error)
  process.exit(1)
}
