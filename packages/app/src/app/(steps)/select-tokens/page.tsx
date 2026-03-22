'use client'
import { TokenSelection } from '@/components/sweeper/TokenSelection'
import { useEffect } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { selectedTokensAtom, stepAtom, tokensAtom, totalValueAtom } from '@/atoms/walletAtoms'
import { useRouter } from 'next/navigation'
import { useAccount } from 'wagmi'

export default function SelectTokens() {
  const { address } = useAccount()
  const router = useRouter()
  const setStep = useSetAtom(stepAtom)

  useEffect(() => {
    setStep(2)
  }, [])

  const tokens = useAtomValue(tokensAtom)
  const [selectedTokens, setSelectedTokens] = useAtom(selectedTokensAtom)

  // Auto-select tokens that are marked as selected (value > $0.01)
  useEffect(() => {
    const preselectedTokens = tokens.filter(token => token.selected)
    if (preselectedTokens.length > 0 && selectedTokens.length === 0) {
      setSelectedTokens(preselectedTokens)
    }
  }, [tokens, selectedTokens.length, setSelectedTokens])

  const toggleTokenSelection = (tokenId: number) => {
    const token = tokens.find((t) => t.id === tokenId)
    if (token?.liquid) {
      setSelectedTokens((prev) =>
        prev.find((x) => x.id === tokenId) ? prev.filter(({ id }) => id !== tokenId) : [...prev, token]
      )
    }
  }

  const totalValue = selectedTokens.reduce((sum, t) => {
    const token = tokens.find(({ id }) => id === t.id)
    return sum + parseFloat(token?.value.replace('$', '').replace(',', '') || '0')
  }, 0)

  const setTotalValue = useSetAtom(totalValueAtom)

  useEffect(() => {
    setTotalValue(totalValue)
  }, [totalValue])

  useEffect(() => {
    if (!address && typeof window !== 'undefined') {
      router.replace('/')
    }
  }, [address])

  return (
    <TokenSelection
      tokens={tokens}
      selectedTokens={selectedTokens}
      totalValue={totalValue}
      onToggleToken={toggleTokenSelection}
      onProceed={() => router.push('/review')}
    />
  )
}
