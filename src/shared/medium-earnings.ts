export const MEDIUM_EARNINGS_STORAGE_KEY = "mediumEarningsSnapshot"

export type MediumEarningsMoney = {
  amount: number
  currency: string
}

export type MediumEarningsSnapshot = {
  currentMonth?: {
    credits: MediumEarningsMoney[]
    endAt: number
    startAt: number
    subtotal: MediumEarningsMoney
  }
  issues: string[]
  posts: Array<{
    earnings: MediumEarningsMoney
    id: string
    publishedAt?: number
    reads: number
    title: string
    url?: string
    views: number
  }>
  payouts: Array<{
    amount: MediumEarningsMoney
    date: string
    debits: Array<{ amount: MediumEarningsMoney; displayName: string }>
    grossAmount: MediumEarningsMoney
    state: string
  }>
  syncedAt: string
  username: string
}

export const EMPTY_MEDIUM_EARNINGS: MediumEarningsSnapshot | null = null

export const normalizeMediumEarningsSnapshot = (value: unknown): MediumEarningsSnapshot | null => {
  if (!value || typeof value !== "object") return null
  const snapshot = value as Partial<MediumEarningsSnapshot>
  if (typeof snapshot.username !== "string" || typeof snapshot.syncedAt !== "string") return null
  if (!Array.isArray(snapshot.posts) || !Array.isArray(snapshot.payouts) || !Array.isArray(snapshot.issues)) return null
  return snapshot as MediumEarningsSnapshot
}

export const mediumEarningsExport = (snapshot: MediumEarningsSnapshot) => ({
  ...snapshot,
  exportedAt: new Date().toISOString(),
  notice: "Derived Medium earnings data only. No cookies, session tokens, request headers, request bodies, or payout-account links are included.",
  schemaVersion: 1,
})
