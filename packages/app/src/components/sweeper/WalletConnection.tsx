'use client'

import { Connect } from '@/components/Connect'
import { useWalletCapabilities } from '@/hooks/useWalletCapabilities'
import Link from 'next/link'
import { useState } from 'react'
import { useAccount } from 'wagmi'

const COMPATIBLE_WALLETS = ['Ambire', 'MetaMask 12+', 'Coinbase Wallet']

function isAmbireWallet(name: string | undefined): boolean {
  if (!name) return false
  return name.toLowerCase().includes('ambire')
}

export function WalletConnection() {
  const { address } = useAccount()
  const { supportsEIP5792, isChecking, walletName } = useWalletCapabilities()
  const [ambireBannerDismissed, setAmbireBannerDismissed] = useState(false)

  const showAmbireBanner =
    address &&
    supportsEIP5792 &&
    !isAmbireWallet(walletName) &&
    !ambireBannerDismissed

  const showWarning = address && !isChecking && !supportsEIP5792

  return (
    <div className='flex flex-col items-center justify-center min-h-screen text-center px-4'>
      <div className='w-full max-w-[224px] mx-auto mb-8 mt-[130px]'>
        <Connect />
      </div>

      {/* EIP-5792 checking indicator */}
      {address && isChecking && (
        <div className='mb-4 text-xs text-base-content/50 flex items-center gap-2'>
          <span className='loading loading-spinner loading-xs' />
          Checking wallet capabilities…
        </div>
      )}

      {/* No EIP-5792 support warning */}
      {showWarning && (
        <div className='alert alert-warning w-full max-w-sm mb-4 text-left text-sm'>
          <svg
            xmlns='http://www.w3.org/2000/svg'
            className='h-5 w-5 shrink-0'
            viewBox='0 0 20 20'
            fill='currentColor'
          >
            <path
              fillRule='evenodd'
              d='M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z'
              clipRule='evenodd'
            />
          </svg>
          <div>
            <div className='font-semibold mb-1'>Batch transactions not supported</div>
            <p className='text-xs opacity-80 mb-2'>
              Your wallet doesn't support EIP-5792 (<code>wallet_sendCalls</code>). Dust sweeping
              will fall back to individual transactions, which costs more gas.
            </p>
            <p className='text-xs opacity-70'>
              For the best experience, try:{' '}
              {COMPATIBLE_WALLETS.map((w, i) => (
                <span key={w}>
                  <strong>{w}</strong>
                  {i < COMPATIBLE_WALLETS.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          </div>
        </div>
      )}

      {/* Ambire promotion banner for EIP-5792 wallets that aren't Ambire */}
      {showAmbireBanner && (
        <div className='flex items-start gap-3 w-full max-w-sm mb-4 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left text-xs'>
          <span className='text-primary mt-0.5'>✦</span>
          <div className='flex-1'>
            <span className='font-semibold text-primary'>Tip:</span>{' '}
            <span className='text-base-content/70'>
              Ambire Wallet offers native batch transactions and gas abstraction — perfect for
              sweeping dust efficiently.
            </span>{' '}
            <a
              href='https://www.ambire.com'
              target='_blank'
              rel='noopener noreferrer'
              className='text-primary underline underline-offset-2 hover:opacity-80'
            >
              Learn more ↗
            </a>
          </div>
          <button
            onClick={() => setAmbireBannerDismissed(true)}
            className='text-base-content/40 hover:text-base-content/70 transition-colors ml-1 shrink-0'
            aria-label='Dismiss'
          >
            ✕
          </button>
        </div>
      )}

      {address && (
        <Link href='/scan-holdings'>
          <button className='btn-start-scanning mb-4'>
            <span className='gradient-text'>/Dust_OPS_Init</span>
          </button>
        </Link>
      )}
    </div>
  )
}
