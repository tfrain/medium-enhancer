// Registers the Reader Interests tap (src/page/reader-interest-tap.ts) as a
// MAIN-world content script. Called from the worker on install/update and on
// startup. A registration survives updates while the bundled file name (it
// carries a content hash) changes, so the old one is removed first — otherwise
// registering the same id fails and the tap silently stops loading.

import tapUrl from 'url:../page/reader-interest-tap'

export const READER_TAP_ID = 'me-reader-interest-tap'

export const readerTapScript = (url: string = tapUrl): chrome.scripting.RegisteredContentScript => ({
  id: READER_TAP_ID,
  js: [url.split('/').pop()!.split('?')[0]],
  matches: ['https://*.medium.com/*'],
  runAt: 'document_start',
  world: 'MAIN',
  persistAcrossSessions: true,
})

export const registerReaderInterestTap = async () => {
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [READER_TAP_ID] })
  if (existing.some(item => item.id === READER_TAP_ID)) await chrome.scripting.unregisterContentScripts({ ids: [READER_TAP_ID] })
  await chrome.scripting.registerContentScripts([readerTapScript()])
}
