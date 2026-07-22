export type ObsidianUriInfo = {
  uri: string
  transport: "data" | "clipboard"
  filepath: string
  length: number
}

const DEFAULT_MAX_DATA_URI_LENGTH = 6000

const ensureMarkdownExtension = (title: string): string => {
  const value = String(title || "Untitled").trim() || "Untitled"
  return value.endsWith(".md") ? value : `${value}.md`
}

export const buildObsidianFilepath = (folder = "", title = "Untitled"): string => {
  const trimmedFolder = String(folder || "").trim()
  const folderPath = trimmedFolder && !trimmedFolder.endsWith("/")
    ? `${trimmedFolder}/`
    : trimmedFolder
  return folderPath + ensureMarkdownExtension(title)
}

const normalizeFilepath = (filepath: string): string => {
  const value = String(filepath || "").trim()
  if (!value) return ""
  return ensureMarkdownExtension(value.replace(/^\/+/, "").replace(/\/{2,}/g, "/"))
}

const encodeQueryParameter = (key: string, value: string): string =>
  `${encodeURIComponent(key)}=${encodeURIComponent(String(value ?? ""))}`

const buildAdvancedUri = (parameters: Record<string, string>): string =>
  `obsidian://adv-uri?${Object.entries(parameters)
    .map(([key, value]) => encodeQueryParameter(key, value))
    .join("&")}`

export const createObsidianAdvancedUri = ({
  vault = "",
  folder = "",
  title = "Untitled",
  filepath = "",
  markdown = "",
  maxDataUriLength = DEFAULT_MAX_DATA_URI_LENGTH,
}: {
  vault?: string
  folder?: string
  title?: string
  filepath?: string
  markdown?: string
  maxDataUriLength?: number
} = {}): ObsidianUriInfo => {
  const targetFilepath = normalizeFilepath(filepath) || buildObsidianFilepath(folder, title)
  const baseParameters = {
    vault,
    filepath: targetFilepath,
    mode: "new",
  }

  const dataUri = buildAdvancedUri({
    ...baseParameters,
    data: markdown,
  })

  if (markdown && dataUri.length <= maxDataUriLength) {
    return {
      uri: dataUri,
      transport: "data",
      filepath: targetFilepath,
      length: dataUri.length,
    }
  }

  const clipboardUri = buildAdvancedUri({
    ...baseParameters,
    clipboard: "true",
  })

  return {
    uri: clipboardUri,
    transport: "clipboard",
    filepath: targetFilepath,
    length: clipboardUri.length,
  }
}
