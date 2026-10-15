export const triggerJsonDownload = (filename: string, value: unknown): Promise<number> => {
  const body = JSON.stringify(value, null, 2)
  const dataUrl = `data:application/json;charset=utf-8,${encodeURIComponent(body)}`

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
