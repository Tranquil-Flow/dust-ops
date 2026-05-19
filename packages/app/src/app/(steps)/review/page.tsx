'use client'

import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { selectedTokensAtom, destinationAtom, sweepPlanAtom } from '@/atoms/walletAtoms'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'
import { useSweep } from '@/hooks/useSweep'
import { TransactionReview } from '@/components/sweeper/TransactionReview'

export default function Review() {
  const { address } = useAccount()
  const router = useRouter()
  const selectedTokens = useAtomValue(selectedTokensAtom)
  const destination = useAtomValue(destinationAtom)
  const sweepPlan = useAtomValue(sweepPlanAtom)
  const { fetchQuotes, executeSweep, sweepState, isQuoting, isExecuting } = useSweep()

  // Redirect if no wallet or no tokens selected
  useEffect(() => {
    if (!address && typeof window !== 'undefined') router.replace('/')
    if (selectedTokens.length === 0 && typeof window !== 'undefined') router.replace('/select-tokens')
  }, [address, selectedTokens.length, router])

  // Fetch fresh quotes on mount
  useEffect(() => {
    if (selectedTokens.length > 0 && !sweepPlan) {
      fetchQuotes()
    }
  }, [])  

  // Navigate to completion when sweep is done
  useEffect(() => {
    if (sweepState?.phase === 'complete') {
      router.push('/completion')
    }
  }, [sweepState?.phase, router])

  return (
    <TransactionReview
      sweepPlan={sweepPlan}
      sweepState={sweepState}
      selectedTokens={selectedTokens}
      destination={destination}
      isQuoting={isQuoting}
      isExecuting={isExecuting}
      onRefreshQuotes={fetchQuotes}
      onStartSweep={executeSweep}
    />
  )
}
