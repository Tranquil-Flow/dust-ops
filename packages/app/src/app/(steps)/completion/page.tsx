'use client'

import { useEffect } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { sweepStateAtom, sweepPlanAtom, selectedTokensAtom, scannedTokensAtom, destinationAtom } from '@/atoms/walletAtoms'
import { SweepCompletion } from '@/components/sweeper/SweepCompletion'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'

export default function Completion() {
  const { address } = useAccount()
  const router = useRouter()
  const sweepState = useAtomValue(sweepStateAtom)
  const sweepPlan = useAtomValue(sweepPlanAtom)

  // Atom setters for reset
  const setSelectedTokens = useSetAtom(selectedTokensAtom)
  const setScannedTokens = useSetAtom(scannedTokensAtom)
  const setSweepPlan = useSetAtom(sweepPlanAtom)
  const setSweepState = useSetAtom(sweepStateAtom)
  const setDestination = useSetAtom(destinationAtom)

  // Redirect if no wallet or no sweep state
  useEffect(() => {
    if (!address && typeof window !== 'undefined') {
      router.replace('/')
    }
  }, [address, router])

  const handleStartNewSweep = () => {
    // Reset all sweep-related atoms
    setSelectedTokens([])
    setScannedTokens([])
    setSweepPlan(null)
    setSweepState(null)
    setDestination({ chainId: 8453, address: '' })
    router.push('/')
  }

  return (
    <SweepCompletion
      sweepState={sweepState}
      sweepPlan={sweepPlan}
      onStartNewSweep={handleStartNewSweep}
    />
  )
}
