export type AiProvider = "ollama" | "openai" | "anthropic"

export const DEFAULT_AI_PROVIDER: AiProvider = "ollama"
export const DEFAULT_OLLAMA_URL = "http://localhost:11434"
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  ollama: "llama3",
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5"
}

export const AI_STORAGE_KEYS = [
  "aiProvider",
  "ollamaBaseUrl",
  "ollamaModel",
  "openaiApiKey",
  "anthropicApiKey",
  "openaiModel",
  "anthropicModel",
  "aiApiKey",
  "aiCloudModel"
]

// A legacy credential belongs only to the provider selected when it was stored.
// Existing per-provider values (including an intentionally empty key) win.
export const migrateLegacyAiSettings = (stored: Record<string, any>) => {
  const updates: Record<string, string> = {}
  const provider = stored.aiProvider
  if (provider === "openai" || provider === "anthropic") {
    for (const [oldKey, suffix] of [
      ["aiApiKey", "ApiKey"],
      ["aiCloudModel", "Model"]
    ]) {
      const key = provider + suffix
      if (stored[key] === undefined && typeof stored[oldKey] === "string")
        updates[key] = stored[oldKey]
    }
  }
  return {
    updates,
    removeKeys: ["aiApiKey", "aiCloudModel"].filter((key) => key in stored)
  }
}

export const getAiConfig = (
  stored: Record<string, any>,
  selected?: AiProvider
) => {
  const value = selected ?? stored.aiProvider
  const provider: AiProvider =
    value === "openai" || value === "anthropic" ? value : "ollama"
  return {
    provider,
    baseUrl: stored.ollamaBaseUrl || DEFAULT_OLLAMA_URL,
    model:
      String(stored[provider + "Model"] || "").trim() ||
      DEFAULT_MODELS[provider],
    apiKey:
      provider === "ollama"
        ? ""
        : String(stored[provider + "ApiKey"] || "").trim()
  }
}

let pendingRead: Promise<Record<string, any>> | undefined
export const readAiSettings = (): Promise<Record<string, any>> => {
  if (pendingRead) return pendingRead
  pendingRead = (async () => {
    const stored = await chrome.storage.local.get(AI_STORAGE_KEYS)
    const { updates, removeKeys } = migrateLegacyAiSettings(stored)
    if (Object.keys(updates).length) await chrome.storage.local.set(updates)
    if (removeKeys.length) await chrome.storage.local.remove(removeKeys)
    const result = { ...stored, ...updates }
    for (const key of removeKeys) delete result[key]
    return result
  })().finally(() => {
    pendingRead = undefined
  })
  return pendingRead
}
