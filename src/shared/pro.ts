export type ProKey = { hash: string; validUntil: string }
export type ProStatus = { state: 'none' | 'active' | 'expired'; key?: string; validUntil?: string }

// Only SHA-256 hashes ship. Add new keys here, never the plaintext key.
// Never delete an old entry: expired keys must say "expired", not "wrong key".
// Expiry always comes from this table, so saved unlocks cannot outlive their key.
export const PRO_KEYS: readonly ProKey[] = [
  { hash: '956d90ec4a1b343877f842c93cab67aca6f7fc9d5991bdc84b871e8e020d7ac4', validUntil: '2027-12-31' },
]
export const PRO_GET_KEY_URL = ''
export const canGetProKey = (url: string = PRO_GET_KEY_URL): boolean => !!url.trim()

export const sha256Hex = async (text: string): Promise<string> => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export const keyStatus = async (key: unknown, now = new Date(), keys = PRO_KEYS): Promise<ProStatus> => {
  if (typeof key !== 'string') return { state: 'none' }
  const normalized = key.trim().toUpperCase()
  if (!normalized) return { state: 'none' }
  const hash = await sha256Hex(normalized)
  const found = keys.find(k => k.hash === hash)
  if (!found) return { state: 'none' }
  return {
    state: now.toISOString().slice(0, 10) <= found.validUntil ? 'active' : 'expired',
    key: normalized,
    validUntil: found.validUntil,
  }
}

export const proStatus = async (now = new Date(), keys = PRO_KEYS): Promise<ProStatus> => {
  const read = async (area: chrome.storage.StorageArea): Promise<ProStatus> => {
    try {
      const saved = await area.get(['enhancerProUnlocked', 'enhancerProKey'])
      return saved?.enhancerProUnlocked === true ? await keyStatus(saved.enhancerProKey, now, keys) : { state: 'none' }
    } catch { return { state: 'none' } }
  }
  const local = await read(chrome.storage.local)
  if (local.state === 'active') return local
  const synced = await read(chrome.storage.sync)
  if (synced.state === 'active') {
    try { await chrome.storage.local.set({ enhancerProUnlocked: true, enhancerProKey: synced.key }) } catch { /* sync is enough */ }
    return synced
  }
  return local.state === 'expired' ? local : synced
}

export const isPro = async (now = new Date(), keys = PRO_KEYS): Promise<boolean> =>
  (await proStatus(now, keys)).state === 'active'

export const tryUnlock = async (key: string, now = new Date(), keys = PRO_KEYS): Promise<'ok' | 'expired' | 'wrong'> => {
  const normalized = key.trim().toUpperCase()
  const status = await keyStatus(normalized, now, keys)
  if (status.state === 'none') return 'wrong'
  if (status.state === 'expired') return 'expired'
  const saved = { enhancerProUnlocked: true, enhancerProKey: normalized }
  await chrome.storage.local.set(saved)
  try { await chrome.storage.sync.set(saved) } catch { /* local is enough */ }
  return 'ok'
}
