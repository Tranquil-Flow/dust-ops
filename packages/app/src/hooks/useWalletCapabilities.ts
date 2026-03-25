'use client'

import { useEffect, useState } from 'react'
import { useWalletClient } from 'wagmi'

export interface WalletCapabilitiesResult {
  supportsEIP5792: boolean
  isChecking: boolean
  walletName: string | undefined
}

export function useWalletCapabilities(): WalletCapabilitiesResult {
  const { data: walletClient } = useWalletClient()
  const [supportsEIP5792, setSupportsEIP5792] = useState(false)
  const [isChecking, setIsChecking] = useState(false)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wc = walletClient as any
  const walletName: string | undefined =
    wc?.transport?.name ?? wc?.account?.connector?.name ?? undefined

  useEffect(() => {
    if (!walletClient) {
      setSupportsEIP5792(false)
      setIsChecking(false)
      return
    }

    let cancelled = false
    setIsChecking(true)

    async function checkCapabilities() {
      try {
        // EIP-5792: wallet_getCapabilities returns a map of chainId → capabilities
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (walletClient as any).request({
          method: 'wallet_getCapabilities',
          params: [],
        })
        if (!cancelled) {
          setSupportsEIP5792(true)
        }
      } catch {
        // Any error (method not found, user rejected, etc.) → no support
        if (!cancelled) {
          setSupportsEIP5792(false)
        }
      } finally {
        if (!cancelled) {
          setIsChecking(false)
        }
      }
    }

    checkCapabilities()

    return () => {
      cancelled = true
    }
  }, [walletClient])

  return { supportsEIP5792, isChecking, walletName }
}
