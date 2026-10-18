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

export const keyStatus = async (key: string, now = new Date(), keys = PRO_KEYS): Promise<ProStatus> => {
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

const savedUnlock = async () => {
  const local = await chrome.storage.local.get(['enhancerProUnlocked', 'enhancerProKey'])
  if (local.enhancerProUnlocked === true) return local
  // A fresh install on a synced Chrome profile: restore the buyer's saved key.
  try {
    const synced = await chrome.storage.sync.get(['enhancerProUnlocked', 'enhancerProKey'])
    if (synced.enhancerProUnlocked === true) {
      await chrome.storage.local.set({ enhancerProUnlocked: true, enhancerProKey: synced.enhancerProKey || '' })
      return synced
    }
  } catch { /* sync unavailable: local only */ }
  return null
}

export const proStatus = async (now = new Date(), keys = PRO_KEYS): Promise<ProStatus> => {
  const saved = await savedUnlock()
  return saved ? keyStatus(saved.enhancerProKey || '', now, keys) : { state: 'none' }
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
