'use client'

import { legacySelectedTokensAtom, stepAtom, tokensAtom, totalValueAtom } from '@/atoms/walletAtoms'
import { TransactionReview } from '@/components/sweeper/TransactionReview'
import { useAtomValue, useSetAtom } from 'jotai'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'

export default function Review() {
  const { address } = useAccount()
  const router = useRouter()
  const setStep = useSetAtom(stepAtom)

  const totalValue = useAtomValue(totalValueAtom)
  const tokens = useAtomValue(tokensAtom)
  const selectedTokens = useAtomValue(legacySelectedTokensAtom)

  useEffect(() => {
    setStep(3)
  }, [])

  if (!address && typeof window !== 'undefined') {
    router.replace('/')
    return null
  }

  return (
    <TransactionReview
      selectedTokens={selectedTokens}
      tokens={tokens}
      totalValue={totalValue}
      onStartSweep={() => {
        setTimeout(() => {
          router.push('/completion')
        }, 500)
      }}
    />
  )
}
