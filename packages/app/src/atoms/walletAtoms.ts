import { atom } from 'jotai'
import type { ScannedToken, SweepPlan, SweepState } from '../config/types'

// ---------------------------------------------------------------------------
// Legacy types (used by existing UI components — to be migrated)
// ---------------------------------------------------------------------------

/** @deprecated Use ScannedToken from config/types instead */
export type Token = {
  id: number
  symbol: string
  name: string
  chain: string
  balance: string
  value: string
  liquid: boolean
  selected: boolean
}

// ---------------------------------------------------------------------------
// Legacy atoms (used by existing UI components — to be migrated)
// ---------------------------------------------------------------------------

/** @deprecated Use scannedTokensAtom instead */
export const tokensAtom = atom<Token[]>([])

/** @deprecated Use selectedTokensAtom (ScannedToken[]) for new sweep flow */
export const legacySelectedTokensAtom = atom<Token[]>([])

/** @deprecated Wizard step tracking — to be replaced by router-based navigation */
export const stepAtom = atom<number>(0)

/** @deprecated Use sweepPlanAtom.totalValueUsd instead */
export const totalValueAtom = atom<number>(0)

// ---------------------------------------------------------------------------
// Scan results
// ---------------------------------------------------------------------------

/** All tokens discovered across all supported chains for the connected wallet */
export const scannedTokensAtom = atom<ScannedToken[]>([])

/** Tokens the user has selected for sweeping */
export const selectedTokensAtom = atom<ScannedToken[]>([])

// ---------------------------------------------------------------------------
// Sweep planning & execution
// ---------------------------------------------------------------------------

/** The computed sweep plan (quotes, totals) ready for user confirmation */
export const sweepPlanAtom = atom<SweepPlan | null>(null)

/** Live execution state while a sweep is in progress */
export const sweepStateAtom = atom<SweepState | null>(null)

// ---------------------------------------------------------------------------
// Destination
// ---------------------------------------------------------------------------

/** Where the swept funds should land */
export const destinationAtom = atom<{ chainId: number; address: string }>({
  chainId: 8453, // default: Base (ultra-low gas)
  address: '',
})
