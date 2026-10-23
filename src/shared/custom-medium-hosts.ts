// Host validation also prevents match-pattern or registration-id injection.
export const validCustomMediumHost = (host: unknown): host is string =>
  typeof host === 'string' && host.length <= 253 && host === host.toLowerCase() &&
  host.includes('.') && host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))

export const readCustomMediumHosts = async (): Promise<string[]> => {
  const { customMediumHosts } = await chrome.storage.local.get({ customMediumHosts: [] })
  return Array.isArray(customMediumHosts) ? [...new Set(customMediumHosts.filter(validCustomMediumHost))] : []
}

const scriptFor = (host: string): chrome.scripting.RegisteredContentScript => {
  const js = chrome.runtime.getManifest().content_scripts?.[0]?.js
  if (!js?.length) throw new Error('Content script files are unavailable.')
  return { id: `me-custom-${host}`, matches: [`https://${host}/*`], js, runAt: 'document_end', persistAcrossSessions: true }
}

const registerHost = async (host: string) => {
  const script = scriptFor(host)
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [script.id] })
  if (existing.some(item => item.id === script.id)) await chrome.scripting.unregisterContentScripts({ ids: [script.id] })
  await chrome.scripting.registerContentScripts([script])
}

// Multiple extension windows can change access at once. Serialize the whole
// permission/registration/storage transaction, including update reconciliation.
let hostMutation = Promise.resolve()
const mutateHosts = (task: () => Promise<void>): Promise<void> => {
  const result = hostMutation.then(task)
  hostMutation = result.catch(() => {})
  return result
}

export const enableCustomMediumHost = (host: string, tabId: number) => mutateHosts(async () => {
  if (!validCustomMediumHost(host) || !Number.isSafeInteger(tabId)) throw new Error('Invalid custom domain.')
  const tab = await chrome.tabs.get(tabId)
  if (!tab.url || new URL(tab.url).origin !== `https://${host}`) throw new Error('The active page changed. Reopen the popup.')
  if (!await chrome.permissions.contains({ origins: [`https://${host}/*`] })) throw new Error('Site permission is required.')
  await registerHost(host)
  const hosts = await readCustomMediumHosts()
  await chrome.storage.local.set({ customMediumHosts: [...new Set([...hosts, host])] })
  await chrome.scripting.executeScript({ target: { tabId }, files: scriptFor(host).js! })
})

export const removeCustomMediumHost = (host: string) => mutateHosts(async () => {
  if (!validCustomMediumHost(host)) throw new Error('Invalid custom domain.')
  if (!await chrome.permissions.remove({ origins: [`https://${host}/*`] })) throw new Error('Could not remove site permission.')
  const id = `me-custom-${host}`
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [id] })
  if (registered.some(item => item.id === id)) await chrome.scripting.unregisterContentScripts({ ids: [id] })
  await chrome.storage.local.set({ customMediumHosts: (await readCustomMediumHosts()).filter(item => item !== host) })
})

export const reconcileCustomMediumHosts = () => mutateHosts(async () => {
  const hosts = await readCustomMediumHosts()
  const allowed: string[] = []
  for (const host of hosts) {
    if (await chrome.permissions.contains({ origins: [`https://${host}/*`] })) allowed.push(host)
  }
  const registered = await chrome.scripting.getRegisteredContentScripts()
  const ids = registered.filter(item => item.id.startsWith('me-custom-')).map(item => item.id)
  if (ids.length) await chrome.scripting.unregisterContentScripts({ ids })
  for (const host of allowed) await registerHost(host)
  await chrome.storage.local.set({ customMediumHosts: allowed })
})
