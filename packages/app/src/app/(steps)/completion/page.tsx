'use client'

import { legacySelectedTokensAtom, stepAtom } from '@/atoms/walletAtoms'
import { SweepCompletion } from '@/components/sweeper/SweepCompletion'
import { useAtomValue, useSetAtom } from 'jotai'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { useAccount } from 'wagmi'

export default function Completion() {
  const { address } = useAccount()
  const router = useRouter()
  const setStep = useSetAtom(stepAtom)
  const selectedTokens = useAtomValue(legacySelectedTokensAtom)

  useEffect(() => {
    setStep(4)
  }, [])

  useEffect(() => {
    if (!address && typeof window !== 'undefined') {
      router.replace('/')
    }
  }, [address])

  return <SweepCompletion selectedTokens={selectedTokens} />
}
