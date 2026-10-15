// The content script is registered up front only for the site allowlist.
// Anywhere else it is injected when the user asks for something (context
// menu, keyboard shortcut, popup button): that click grants activeTab, so the
// extension needs no "all websites" permission.
//
// A ping first, so a tab that already has the script (allowlisted site, or an
// earlier injection) is not given a second copy.

const ping = (tabId: number): Promise<boolean> =>
  new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: 'me-ping' }, (res) => {
      void chrome.runtime.lastError
      resolve(!!res?.ok)
    })
  })

export const ensureContentScript = async (tabId: number): Promise<void> => {
  if (await ping(tabId)) return
  const scripts = chrome.runtime.getManifest().content_scripts || []
  const css = scripts.flatMap((s) => s.css || [])
  const js = scripts.flatMap((s) => s.js || [])
  if (css.length) await chrome.scripting.insertCSS({ target: { tabId }, files: css })
  if (js.length) await chrome.scripting.executeScript({ target: { tabId }, files: js })
}

export const sendToTab = async <T = any>(tabId: number, message: unknown): Promise<T | undefined> => {
  await ensureContentScript(tabId)
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (res) => {
      void chrome.runtime.lastError
      resolve(res)
    })
  })
}
