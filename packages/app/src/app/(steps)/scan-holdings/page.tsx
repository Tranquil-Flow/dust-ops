'use client'

import { scannedTokensAtom, stepAtom, tokensAtom, type Token } from '@/atoms/walletAtoms'
import { CHAINS, CHAIN_MAP } from '@/config/chains'
import type { ScannedToken } from '@/config/types'
import { useSetAtom } from 'jotai'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  ArrowPathIcon,
  CheckCircleIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline'
import { useAccount } from 'wagmi'

interface TokenBalance {
  address: string
  symbol: string
  name: string
  decimals: number
  balance: string
  logoUrl?: string
}

interface ChainScanResult {
  chainId: number
  tokens: TokenBalance[]
  error?: string
}

type ChainStatus = 'scanning' | 'done' | 'error'

interface ChainState {
  chainId: number
  name: string
  status: ChainStatus
  tokenCount: number
  error?: string
}

function formatBalance(rawBalance: string, decimals: number): string {
  try {
    const raw = BigInt(rawBalance)
    const divisor = BigInt(10 ** decimals)
    const whole = raw / divisor
    const remainder = raw % divisor
    if (remainder === BigInt(0)) return whole.toString()
    const fracStr = remainder.toString().padStart(decimals, '0').replace(/0+$/, '')
    return `${whole}.${fracStr}`
  } catch {
    return '0'
  }
}

function convertTokenBalance(tb: TokenBalance, chainId: number): ScannedToken {
  return {
    chainId,
    address: tb.address,
    symbol: tb.symbol,
    name: tb.name,
    decimals: tb.decimals,
    balance: BigInt(tb.balance),
    balanceFormatted: formatBalance(tb.balance, tb.decimals),
    priceUsd: null,
    valueUsd: null,
    estimatedGasUsd: null,
    viability: 'sweepable',
    logoUrl: tb.logoUrl,
  }
}

function convertToLegacyToken(scanned: ScannedToken, index: number): Token {
  const chain = CHAIN_MAP[scanned.chainId]
  const chainName = chain ? chain.name : `Chain ${scanned.chainId}`
  return {
    id: index,
    symbol: scanned.symbol,
    name: scanned.name,
    chain: chainName,
    balance: scanned.balanceFormatted,
    value: '—',
    liquid: true,
    selected: true,
  }
}

export default function ScanHoldings() {
  const { address } = useAccount()
  const router = useRouter()
  const setStep = useSetAtom(stepAtom)
  const setScannedTokens = useSetAtom(scannedTokensAtom)
  const setTokens = useSetAtom(tokensAtom)

  // Initialize chain states with all scanning
  const [chainStates, setChainStates] = useState<ChainState[]>(
    CHAINS.map((chain) => ({
      chainId: chain.id,
      name: chain.name,
      status: 'scanning' as ChainStatus,
      tokenCount: 0,
    }))
  )
  const [totalTokens, setTotalTokens] = useState(0)
  const [chainsWithTokens, setChainsWithTokens] = useState(0)
  const [scanComplete, setScanComplete] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)

  useEffect(() => {
    setStep(1)
  }, [setStep])

  useEffect(() => {
    if (!address && typeof window !== 'undefined') {
      router.replace('/')
    }
  }, [address, router])

  useEffect(() => {
    if (!address) return

    const doScan = async () => {
      try {
        const response = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error((errData as { error?: string }).error ?? `HTTP ${response.status}`)
        }

        const data = (await response.json()) as { results: ChainScanResult[]; demo: boolean }

        // Update all chain states at once
        const updatedChainStates = CHAINS.map((chain) => {
          const result = data.results.find((r) => r.chainId === chain.id)
          if (!result) {
            return { chainId: chain.id, name: chain.name, status: 'done' as ChainStatus, tokenCount: 0 }
          }
          if (result.error) {
            return {
              chainId: chain.id,
              name: chain.name,
              status: 'error' as ChainStatus,
              tokenCount: 0,
              error: result.error,
            }
          }
          return {
            chainId: chain.id,
            name: chain.name,
            status: 'done' as ChainStatus,
            tokenCount: result.tokens.length,
          }
        })
        setChainStates(updatedChainStates)

        // Convert to ScannedToken[]
        const scannedTokens: ScannedToken[] = []
        for (const result of data.results) {
          if (!result.error) {
            for (const tb of result.tokens) {
              scannedTokens.push(convertTokenBalance(tb, result.chainId))
            }
          }
        }

        // Store in atoms
        setScannedTokens(scannedTokens)
        const legacyTokens = scannedTokens.map((t, i) => convertToLegacyToken(t, i))
        setTokens(legacyTokens)

        // Update counts
        const total = scannedTokens.length
        const withTokens = updatedChainStates.filter((c) => c.tokenCount > 0).length
        setTotalTokens(total)
        setChainsWithTokens(withTokens)
        setScanComplete(true)

        // Auto-advance after 1.5s
        setTimeout(() => {
          router.push('/select-tokens')
        }, 1500)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        console.error('Scan error:', err)
        setScanError(msg)
        // Mark all chains as done (with error) so UI doesn't hang
        setChainStates((prev) =>
          prev.map((c) => (c.status === 'scanning' ? { ...c, status: 'error' as ChainStatus, error: msg } : c))
        )
      }
    }

    doScan()
  }, [address, router, setScannedTokens, setTokens])

  const allDone = chainStates.every((c) => c.status !== 'scanning')

  return (
    <div className='text-center py-12'>
      <ArrowPathIcon
        className={`w-16 h-16 mx-auto mb-6 spin-gradient ${allDone ? '' : 'animate-spin'}`}
      />
      <h2 className='text-3xl font-bold mb-4 font-tanklager'>Scanning Your Holdings</h2>
      <p className='text-slate-300 mb-8 font-tanklager'>
        {scanComplete
          ? `Found ${totalTokens} token${totalTokens !== 1 ? 's' : ''} across ${chainsWithTokens} chain${chainsWithTokens !== 1 ? 's' : ''}`
          : scanError
          ? `Error: ${scanError}`
          : 'Scanning all chains in parallel...'}
      </p>

      <div className='max-w-md mx-auto'>
        {/* Chain-by-chain checklist */}
        <div className='bg-slate-800 rounded-xl p-4 mb-6 space-y-2'>
          {chainStates.map((chain) => (
            <div key={chain.chainId} className='flex items-center justify-between py-1.5 px-2'>
              <div className='flex items-center gap-3'>
                {chain.status === 'scanning' ? (
                  <ArrowPathIcon className='w-5 h-5 text-blue-400 animate-spin flex-shrink-0' />
                ) : chain.status === 'error' ? (
                  <XCircleIcon className='w-5 h-5 text-red-400 flex-shrink-0' />
                ) : (
                  <CheckCircleIcon
                    className={`w-5 h-5 flex-shrink-0 ${
                      chain.tokenCount > 0 ? 'text-green-400' : 'text-slate-500'
                    }`}
                  />
                )}
                <span className='text-sm font-tanklager text-slate-200'>{chain.name}</span>
              </div>
              <span className='text-xs text-slate-400 font-tanklager'>
                {chain.status === 'scanning' ? (
                  <span className='text-blue-400'>scanning…</span>
                ) : chain.status === 'error' ? (
                  <span className='text-red-400'>error</span>
                ) : chain.tokenCount > 0 ? (
                  <span className='text-green-400'>
                    {chain.tokenCount} token{chain.tokenCount !== 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className='text-slate-500'>0 tokens</span>
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Running total */}
        {scanComplete && (
          <div className='scan-progress-bar h-1.5 rounded-full w-full mb-4' />
        )}

        <p className='text-sm text-slate-400 font-tanklager'>
          {scanComplete
            ? 'Redirecting to token selection…'
            : `Checking ${chainStates.filter((c) => c.status !== 'scanning').length}/${chainStates.length} chains complete`}
        </p>
      </div>
    </div>
  )
}
