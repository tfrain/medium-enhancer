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
    let id: number | undefined
    const finish = (error?: string) => {
      chrome.downloads.onChanged.removeListener(onChanged)
      if (error) reject(new Error(error))
      else resolve(id!)
    }
    const onChanged = (delta: chrome.downloads.DownloadDelta) => {
      if (delta.id !== id) return
      if (delta.error?.current) finish(`Download failed: ${delta.error.current}`)
      else if (delta.state?.current === 'interrupted') finish('Download interrupted.')
      else if (delta.state?.current === 'complete') finish()
    }
    // Listen before starting, then inspect state to cover a download that
    // completes before the download callback supplies its ID.
    chrome.downloads.onChanged.addListener(onChanged)
    chrome.downloads.download({ url: dataUrl, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError || downloadId === undefined) {
        finish(chrome.runtime.lastError?.message || 'Download failed')
        return
      }
      id = downloadId
      chrome.downloads.search({ id }, ([item]) => {
        if (chrome.runtime.lastError) { finish(chrome.runtime.lastError.message || 'Could not check download.'); return }
        if (item?.state === 'complete') finish()
        else if (item?.state === 'interrupted') finish(`Download failed: ${item.error || 'interrupted'}`)
      })
    })
  })
}
