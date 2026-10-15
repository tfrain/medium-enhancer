// Shared by background.ts (context menu) and popup.tsx (button) — both are
// explicit user-click triggers. Never call this automatically on page load.

export const sanitizeFilenameForDownload = (value: string): string =>
  String(value || "Untitled")
    .replace(/[/\\?<>:*|"]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Untitled"

export const triggerMarkdownDownload = (title: string, markdown: string): Promise<number> => {
  const filename = `${sanitizeFilenameForDownload(title)}.md`
  const dataUrl = `data:text/markdown;charset=utf-8,${encodeURIComponent(markdown)}`

  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        reject(new Error(chrome.runtime.lastError?.message || "Download failed"))
        return
      }
      resolve(downloadId)
    })
  })
}
