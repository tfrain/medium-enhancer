import assert from "node:assert/strict"
import { randomBytes, createHash } from "node:crypto"

try {
  const { PRO_KEYS, PRO_GET_KEY_URL, sha256Hex, keyStatus, tryUnlock, proStatus, isPro, canGetProKey } = await import("../src/shared/pro.ts")
  const key = randomBytes(18).toString('hex').toUpperCase()
  const hash = createHash('sha256').update(key).digest('hex')
  const keys = [{ hash, validUntil: '2027-12-31' }]
  const active = new Date('2027-12-31T23:59:59Z')
  const expired = new Date('2028-01-01T00:00:00Z')
  let local: Record<string, unknown> = {}
  let synced: Record<string, unknown> = {}
  let syncFails = false
  let localFails = false
  ;(globalThis as any).chrome = { storage: {
    local: { get: async () => { if (localFails) throw new Error('Unavailable'); return { ...local } }, set: async (v: any) => { Object.assign(local, v) } },
    sync: {
      get: async () => { if (syncFails) throw new Error('Unavailable'); return { ...synced } },
      set: async (v: any) => { if (syncFails) throw new Error('Unavailable'); Object.assign(synced, v) },
    },
  } }
  assert.equal(await sha256Hex(key), hash)
  assert.equal(PRO_KEYS[0].hash, '956d90ec4a1b343877f842c93cab67aca6f7fc9d5991bdc84b871e8e020d7ac4')
  assert.equal(PRO_KEYS[0].validUntil, '2027-12-31')
  assert.equal(PRO_GET_KEY_URL, 'https://buy.stripe.com/6oU00j1iRarUfNR2X54ow01')
  assert.equal(canGetProKey(), true)
  assert.equal(canGetProKey(''), false)
  assert.equal(canGetProKey('https://example.com'), true)
  assert.equal((await keyStatus(key, active, keys)).state, 'active')
  // Fault injection: ignoring validUntil would incorrectly keep this active.
  assert.equal((await keyStatus(key, expired, keys)).state, 'expired')
  assert.equal((await keyStatus(`  ${key.toLowerCase()}  `, active, keys)).state, 'active')
  assert.equal((await keyStatus('invalid', active, keys)).state, 'none')
  assert.equal((await keyStatus('', active, keys)).state, 'none')
  assert.equal(await tryUnlock(key, expired, keys), 'expired', 'known expired key must not say wrong')
  assert.equal(await tryUnlock('invalid', active, keys), 'wrong')
  assert.equal(await tryUnlock('  ', active, keys), 'wrong')
  assert.deepEqual(local, {})
  assert.equal(await tryUnlock(` ${key.toLowerCase()} `, active, keys), 'ok')
  assert.deepEqual(local, { enhancerProUnlocked: true, enhancerProKey: key })
  assert.deepEqual(synced, local)
  assert.equal(await isPro(active, keys), true)
  assert.equal((await proStatus(expired, keys)).state, 'expired')
  assert.equal(await isPro(expired, keys), false)
  local = {}
  assert.equal((await proStatus(active, keys)).key, key)
  assert.deepEqual(local, synced, 'fresh installation restores sync to local')
  local = {}
  synced = { enhancerProUnlocked: true, enhancerProKey: key }
  assert.equal((await proStatus(expired, keys)).state, 'expired', 'restore must also check expiry')
  local = { enhancerProUnlocked: true, enhancerProKey: 'stale' }
  assert.equal((await proStatus(active, keys)).state, 'active', 'stale local must not mask active sync')
  assert.deepEqual(local, synced)
  const renewedKey = randomBytes(18).toString('hex').toUpperCase()
  const renewedKeys = [...keys, { hash: createHash('sha256').update(renewedKey).digest('hex'), validUntil: '2029-12-31' }]
  local = { enhancerProUnlocked: true, enhancerProKey: key }
  synced = { enhancerProUnlocked: true, enhancerProKey: renewedKey }
  assert.equal((await proStatus(expired, renewedKeys)).state, 'active', 'expired local must not mask a synced renewal')
  assert.deepEqual(local, synced)
  localFails = true
  assert.equal((await proStatus(expired, renewedKeys)).state, 'active', 'local read failure must not mask sync')
  localFails = false
  local = { enhancerProUnlocked: true, enhancerProKey: 123 }
  synced = {}
  assert.equal((await proStatus(active, keys)).state, 'none', 'corrupt local key must not throw')
  synced = { enhancerProUnlocked: true, enhancerProKey: { bad: true } }
  assert.equal((await proStatus(active, keys)).state, 'none', 'corrupt sync key must not throw')
  local = {}
  syncFails = true
  assert.equal((await proStatus(active, keys)).state, 'none')
  assert.equal(await tryUnlock(key, active, keys), 'ok', 'sync failure is non-fatal')
  assert.equal(await isPro(active, keys), true)
  local = { enhancerProUnlocked: true }
  assert.equal(await isPro(active, keys), false, 'a saved boolean alone grants no access')
  console.log('PASS Pro hashing, expiry fault injection, normalization, storage and sync restore/failure')
} catch (error) {
  console.error('FAIL Pro:', error)
  process.exit(1)
}
