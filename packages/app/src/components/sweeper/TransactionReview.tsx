import { ChevronDownIcon } from '@heroicons/react/24/outline'
import { useState, useEffect } from 'react'
import type { Token } from '@/atoms/walletAtoms'

interface TransactionReviewProps {
  selectedTokens: Token[]
  tokens: Token[]
  totalValue: number
  onStartSweep: () => void
}

// Available chains from the API
const AVAILABLE_CHAINS = [
  { name: 'Base', ticker: 'BASE' },
  { name: 'Optimism', ticker: 'OP' },
  { name: 'Unichain', ticker: 'UNI' }
]

export function TransactionReview({
  selectedTokens,
  tokens, // eslint-disable-line @typescript-eslint/no-unused-vars
  totalValue, // eslint-disable-line @typescript-eslint/no-unused-vars
  onStartSweep,
}: TransactionReviewProps) {
  const [newWalletAddress, setNewWalletAddress] = useState('')
  const [selectedChain, setSelectedChain] = useState<string>('')
  const [isChainDropdownOpen, setIsChainDropdownOpen] = useState(false)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element
      if (!target.closest('.chain-dropdown')) {
        setIsChainDropdownOpen(false)
      }
    }

    if (isChainDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isChainDropdownOpen])

  // Calculate actual total value from selected tokens
  const actualTotalValue = selectedTokens.reduce((sum, token) => {
    const value = parseFloat(token.value.replace('$', '').replace(',', '') || '0')
    return sum + value
  }, 0)

  return (
    <div className='py-8'>
      <h2 className='text-3xl font-bold mb-8'>Review Sweep Transaction</h2>

      <div className='grid lg:grid-cols-2 gap-8'>
        <div className='space-y-6'>
          <div className='bg-slate-800/50 rounded-xl p-6'>
            <h3 className='text-xl font-semibold mb-4'>Transaction Summary</h3>
            <div className='space-y-3'>
              <div className='flex justify-between'>
                <span className='text-slate-400'>Selected Tokens:</span>
                <span>{selectedTokens.length}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-slate-400'>Total Value:</span>
                <span className='font-semibold' style={{ color: '#BBB424' }}>${actualTotalValue.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <div className='space-y-6'>
          <div className='bg-slate-800/50 rounded-xl p-6'>
            <h3 className='text-xl font-semibold mb-4'>Wallet Address</h3>
            <div className='space-y-4'>
              <div>
                <label className='block text-sm font-medium mb-3 font-tanklager' style={{ color: '#BBB424' }}>
                  ADD NEW WALLET ADDRESS HERE
                </label>
                <div className='flex gap-3'>
                  <input
                    type='text'
                    placeholder='0x...'
                    value={newWalletAddress}
                    onChange={(e) => setNewWalletAddress(e.target.value)}
                    className='flex-1 px-4 py-3 rounded-xl border font-mono text-sm transition-all duration-300'
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: 'white',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
                    }}
                    onFocus={(e) => {
                      e.target.style.background = 'rgba(255, 255, 255, 0.15)'
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.4)'
                      e.target.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.2), 0 0 0 3px rgba(255, 255, 255, 0.1)'
                    }}
                    onBlur={(e) => {
                      e.target.style.background = 'rgba(255, 255, 255, 0.1)'
                      e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)'
                      e.target.style.boxShadow = '0 8px 32px rgba(0, 0, 0, 0.1)'
                    }}
                  />

                  {/* Chain Selection Dropdown */}
                  <div className='relative chain-dropdown'>
                    <button
                      type='button'
                      onClick={() => setIsChainDropdownOpen(!isChainDropdownOpen)}
                      className='px-4 py-3 rounded-xl border font-mono text-sm transition-all duration-300 flex items-center gap-2 min-w-[80px] justify-center'
                      style={{
                        background: selectedChain ? 'rgba(187, 180, 36, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                        backdropFilter: 'blur(10px)',
                        WebkitBackdropFilter: 'blur(10px)',
                        border: selectedChain ? '1px solid rgba(187, 180, 36, 0.3)' : '1px solid rgba(255, 255, 255, 0.2)',
                        color: 'white',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
                      }}>
                      <span className='font-tanklager font-semibold'>
                        {selectedChain || 'CHAIN'}
                      </span>
                      <ChevronDownIcon className='w-4 h-4' />
                    </button>

                    {/* Dropdown Menu */}
                    {isChainDropdownOpen && (
                      <div
                        className='absolute top-full mt-2 right-0 rounded-xl border overflow-hidden z-50'
                        style={{
                          background: 'rgba(30, 30, 30, 0.95)',
                          backdropFilter: 'blur(20px)',
                          WebkitBackdropFilter: 'blur(20px)',
                          border: '1px solid rgba(255, 255, 255, 0.2)',
                          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)'
                        }}>
                        {AVAILABLE_CHAINS.map((chain) => (
                          <button
                            key={chain.ticker}
                            type='button'
                            onClick={() => {
                              setSelectedChain(chain.ticker)
                              setIsChainDropdownOpen(false)
                            }}
                            className='w-full px-4 py-3 text-left hover:bg-white/10 transition-all duration-200 font-tanklager'
                            style={{ color: 'white' }}>
                            <div className='flex flex-col'>
                              <span className='font-semibold text-sm'>{chain.ticker}</span>
                              <span className='text-xs text-slate-400'>{chain.name}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={() => onStartSweep()}
                disabled={!newWalletAddress.trim() || !selectedChain}
                className='w-full px-6 py-4 font-semibold transition-all text-lg btn-review-sweep disabled:opacity-50 disabled:cursor-not-allowed'
                style={{ borderRadius: '0.75rem' }}>
                <span className='uppercase text-white font-bold'>
                  {!selectedChain ? 'SELECT CHAIN TO CONTINUE' : 'CONFIRM & START SWEEP'}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
