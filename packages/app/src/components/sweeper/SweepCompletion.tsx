import { CheckIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline'
import type { SweepState, SweepPlan } from '@/config/types'
import { CHAIN_MAP } from '@/config/chains'

interface SweepCompletionProps {
  sweepState: SweepState | null
  sweepPlan: SweepPlan | null
  onStartNewSweep: () => void
}

function formatUsd(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function truncateAddress(address: string): string {
  if (!address || address.length < 10) return address
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function SweepCompletion({ sweepState, sweepPlan: _sweepPlan, onStartNewSweep }: SweepCompletionProps) {
  // Fallback when there's no sweep data
  if (!sweepState) {
    return (
      <div className='py-8 min-h-screen flex flex-col items-center justify-center'>
        <div className='text-center mb-12' style={{ transform: 'translateY(-15vh)' }}>
          <div
            className='w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-8'
            style={{
              background: 'linear-gradient(90deg, #7841B1 0%, #C6233D 40%, #CA871E 75%, #BBB424 100%)'
            }}>
            <CheckIcon className='w-16 h-16 text-white' />
          </div>
          <h2 className='text-4xl font-bold mb-4 font-tanklager'>Sweep Complete!</h2>
          <p className='text-slate-400 text-base font-tanklager mb-8'>No sweep data available.</p>
          <button
            onClick={onStartNewSweep}
            className='px-8 py-4 font-semibold transition-all text-lg btn-review-sweep'
            style={{ borderRadius: '0.75rem' }}>
            <span className='uppercase text-white font-bold'>START NEW SWEEP</span>
          </button>
        </div>
      </div>
    )
  }

  const destinationChain = CHAIN_MAP[sweepState.destinationChainId]
  const destinationChainName = destinationChain?.name ?? `Chain ${sweepState.destinationChainId}`
  const destinationExplorerUrl = destinationChain
    ? `${destinationChain.blockExplorerUrl}/address/${sweepState.destinationAddress}`
    : null

  return (
    <div className='py-8 min-h-screen flex flex-col items-center justify-center'>
      <div className='text-center mb-12 w-full max-w-lg px-4' style={{ transform: 'translateY(-10vh)' }}>
        {/* Success icon */}
        <div
          className='w-32 h-32 rounded-full flex items-center justify-center mx-auto mb-8'
          style={{
            background: 'linear-gradient(90deg, #7841B1 0%, #C6233D 40%, #CA871E 75%, #BBB424 100%)'
          }}>
          <CheckIcon className='w-16 h-16 text-white' />
        </div>

        {/* Title */}
        <h2 className='text-4xl font-bold mb-2 font-tanklager'>Sweep Complete!</h2>
        <p className='text-slate-300 text-lg font-tanklager mb-8'>
          Your tokens have been successfully swept!
        </p>

        {/* Results summary */}
        <div className='bg-slate-800/50 rounded-xl p-6 mb-6 text-left backdrop-blur-sm border border-slate-700/50'>
          <h3 className='text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 font-tanklager'>
            Results
          </h3>
          <div className='space-y-3'>
            <div className='flex justify-between items-center'>
              <span className='text-slate-300 font-tanklager'>Total Value Swept</span>
              <span className='font-bold font-tanklager' style={{ color: '#BBB424' }}>
                {formatUsd(sweepState.totalValueUsd)}
              </span>
            </div>
            <div className='flex justify-between items-center'>
              <span className='text-slate-300 font-tanklager'>Total Gas Spent</span>
              <span className='font-semibold text-slate-200 font-tanklager'>
                {formatUsd(sweepState.totalGasUsd)}
              </span>
            </div>
            <div className='border-t border-slate-700/60 pt-3 flex justify-between items-center'>
              <span className='text-slate-200 font-semibold font-tanklager'>Net Proceeds</span>
              <span className='font-bold text-lg font-tanklager' style={{ color: '#BBB424' }}>
                {formatUsd(sweepState.netProceedsUsd)}
              </span>
            </div>
          </div>
        </div>

        {/* Destination info */}
        <div className='bg-slate-800/50 rounded-xl p-6 mb-6 text-left backdrop-blur-sm border border-slate-700/50'>
          <h3 className='text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 font-tanklager'>
            Destination
          </h3>
          <div className='space-y-2'>
            <div className='flex justify-between items-center'>
              <span className='text-slate-300 font-tanklager'>Network</span>
              <span className='text-slate-100 font-semibold font-tanklager'>{destinationChainName}</span>
            </div>
            <div className='flex justify-between items-center'>
              <span className='text-slate-300 font-tanklager'>Address</span>
              <div className='flex items-center gap-2'>
                <span className='text-slate-100 font-mono text-sm'>
                  {truncateAddress(sweepState.destinationAddress)}
                </span>
                {destinationExplorerUrl && (
                  <a
                    href={destinationExplorerUrl}
                    target='_blank'
                    rel='noopener noreferrer'
                    className='text-slate-400 hover:text-slate-200 transition-colors'
                    title='View on block explorer'>
                    <ArrowTopRightOnSquareIcon className='w-4 h-4' />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Per-chain results */}
        {sweepState.chains.length > 0 && (
          <div className='bg-slate-800/50 rounded-xl p-6 mb-8 text-left backdrop-blur-sm border border-slate-700/50'>
            <h3 className='text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 font-tanklager'>
              Chain Details
            </h3>
            <div className='space-y-4'>
              {sweepState.chains.map((chainState) => {
                const chain = CHAIN_MAP[chainState.chainId]
                const chainName = chain?.name ?? `Chain ${chainState.chainId}`
                const txExplorerUrl = chainState.txHash && chain
                  ? `${chain.blockExplorerUrl}/tx/${chainState.txHash}`
                  : null

                return (
                  <div key={chainState.chainId} className='border-b border-slate-700/40 last:border-0 pb-3 last:pb-0'>
                    <div className='flex justify-between items-start mb-1'>
                      <span className='text-slate-200 font-semibold font-tanklager'>{chainName}</span>
                      <span className='text-slate-400 text-sm font-tanklager'>
                        {chainState.tokensCompleted}/{chainState.tokensTotal} tokens
                      </span>
                    </div>

                    {chainState.txHash && (
                      <div className='flex items-center gap-1 mt-1'>
                        <span className='text-slate-400 text-xs font-mono'>
                          {chainState.txHash.slice(0, 10)}…{chainState.txHash.slice(-6)}
                        </span>
                        {txExplorerUrl && (
                          <a
                            href={txExplorerUrl}
                            target='_blank'
                            rel='noopener noreferrer'
                            className='text-slate-400 hover:text-slate-200 transition-colors'
                            title='View transaction'>
                            <ArrowTopRightOnSquareIcon className='w-3 h-3' />
                          </a>
                        )}
                      </div>
                    )}

                    {chainState.error && (
                      <p className='text-red-400 text-xs mt-1 font-tanklager'>{chainState.error}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Start New Sweep button */}
        <button
          onClick={onStartNewSweep}
          className='px-8 py-4 font-semibold transition-all text-lg btn-review-sweep'
          style={{ borderRadius: '0.75rem' }}>
          <span className='uppercase text-white font-bold'>START NEW SWEEP</span>
        </button>
      </div>
    </div>
  )
}
