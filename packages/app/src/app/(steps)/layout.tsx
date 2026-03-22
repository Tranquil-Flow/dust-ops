'use client'

import { stepAtom } from '@/atoms/walletAtoms'
import { DemoBanner } from '@/components/DemoBanner'
import { ProgressBar } from '@/components/sweeper/ProgressBar'
import { SweeperHeader } from '@/components/sweeper/SweeperHeader'
import { useAtomValue } from 'jotai'
import { PropsWithChildren, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAccount, useDisconnect } from 'wagmi'

const steps = ['Connect Wallet', 'Scan Holdings', 'Select Tokens', 'Review & Sweep', 'Completion']
const stepUrls = ['/', 'scan-holdings', 'select-tokens', 'review', 'completion']

export default function Layout({ children }: PropsWithChildren) {
  const step = useAtomValue(stepAtom)
  const { address } = useAccount()
  const { disconnect } = useDisconnect()
  const router = useRouter()

  // Apply background class and prevent scrolling on first screen
  useEffect(() => {
    if (step === 0) {
      document.body.classList.add('first-screen-bg')
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      document.body.classList.remove('first-screen-bg')
      document.body.style.overflow = 'auto'
      document.documentElement.style.overflow = 'auto'
    }

    // Cleanup on unmount
    return () => {
      document.body.classList.remove('first-screen-bg')
      document.body.style.overflow = 'auto'
      document.documentElement.style.overflow = 'auto'
    }
  }, [step])

  const handleDisconnect = () => {
    disconnect()
    router.push('/')
  }

  const handleConnect = () => {
    router.push('/')
  }

  return (
    <div className={`fixed inset-0 text-white ${step === 0 ? 'overflow-hidden' : 'overflow-auto bg-dark-primary'}`}>
      <DemoBanner />
      <div className='max-w-6xl mx-auto px-6 pb-12'>
        {step !== 0 && (
          <SweeperHeader
            walletConnected={!!address}
            address={address || undefined}
            onDisconnect={handleDisconnect}
            onConnect={handleConnect}
          />
        )}
        {step !== 0 && <ProgressBar steps={steps} stepUrls={stepUrls} currentStep={step} />}
        {children}
      </div>
    </div>
  )
}
