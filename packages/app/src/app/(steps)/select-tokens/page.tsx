'use client'
import { TokenSelection } from '@/components/sweeper/TokenSelection'
import { useEffect, useMemo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import {
  scannedTokensAtom,
  selectedTokensAtom,
  destinationAtom,
  stepAtom,
} from '@/atoms/walletAtoms'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { CHAIN_MAP } from '@/config/chains'
import type { ScannedToken } from '@/config/types'

/** Stable key for a scanned token */
function tokenKey(t: ScannedToken): string {
  return `${t.chainId}-${t.address}`
}

export default function SelectTokens() {
  const { address } = useAccount()
  const router = useRouter()
  const setStep = useSetAtom(stepAtom)

  // Step tracking
  useEffect(() => {
    setStep(2)
  }, [setStep])

  // Redirect if wallet disconnected
  useEffect(() => {
    if (!address && typeof window !== 'undefined') {
      router.replace('/')
    }
  }, [address, router])

  // Atoms
  const scannedTokens = useAtomValue(scannedTokensAtom)
  const [selectedTokens, setSelectedTokens] = useAtom(selectedTokensAtom)
  const [destination, setDestination] = useAtom(destinationAtom)

  // Seed destination address from wallet on first load
  useEffect(() => {
    if (address && !destination.address) {
      setDestination((prev) => ({ ...prev, address }))
    }
  }, [address, destination.address, setDestination])

  // Auto-select all sweepable tokens on initial load
  useEffect(() => {
    if (scannedTokens.length > 0 && selectedTokens.length === 0) {
      setSelectedTokens(scannedTokens.filter((t) => t.viability === 'sweepable'))
    }
  }, [scannedTokens])

  // Selected keys as a Set for O(1) lookup
  const selectedKeys = useMemo(
    () => new Set(selectedTokens.map(tokenKey)),
    [selectedTokens]
  )

  // Toggle a sweepable token
  const handleToggleToken = (key: string) => {
    setSelectedTokens((prev) => {
      const exists = prev.some((t) => tokenKey(t) === key)
      if (exists) {
        return prev.filter((t) => tokenKey(t) !== key)
      }
      const token = scannedTokens.find((t) => tokenKey(t) === key)
      if (!token || token.viability !== 'sweepable') return prev
      return [...prev, token]
    })
  }

  // Group by chain
  const tokensByChain = useMemo(() => {
    const map = new Map<number, ScannedToken[]>()
    for (const t of scannedTokens) {
      if (!map.has(t.chainId)) map.set(t.chainId, [])
      map.get(t.chainId)!.push(t)
    }
    return Array.from(map.entries()).map(([chainId, tokens]) => ({
      chainId,
      chainName: CHAIN_MAP[chainId]?.name ?? `Chain ${chainId}`,
      tokens,
    }))
  }, [scannedTokens])

  // Totals from selected tokens only
  const totals = useMemo(() => {
    const valueUsd = selectedTokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0)
    const gasUsd = selectedTokens.reduce((s, t) => s + (t.estimatedGasUsd ?? 0), 0)
    return { valueUsd, gasUsd, netUsd: valueUsd - gasUsd }
  }, [selectedTokens])

  return (
    <TokenSelection
      tokensByChain={tokensByChain}
      selectedKeys={selectedKeys}
      destination={destination}
      totals={totals}
      onToggleToken={handleToggleToken}
      onDestinationChainChange={(chainId) =>
        setDestination((prev) => ({ ...prev, chainId }))
      }
      onDestinationAddressChange={(addr) =>
        setDestination((prev) => ({ ...prev, address: addr }))
      }
      onProceed={() => router.push('/review')}
    />
  )
}
