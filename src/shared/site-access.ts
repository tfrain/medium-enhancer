// Origin pattern for a non-local Ollama URL, or null for localhost/127.0.0.1
// (those are granted at install). Options asks for it when the URL is saved.
export const ollamaPermissionPattern = (url: string): string | null => {
  try {
    const u = new URL(url)
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return null
    return `${u.protocol}//${u.hostname}/*`
  } catch {
    return null
  }
}
