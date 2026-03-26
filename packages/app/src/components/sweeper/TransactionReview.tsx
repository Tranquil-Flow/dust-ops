import type { ScannedToken, SweepPlan, SweepState, SweepPhase } from '@/config/types'
import { CHAIN_MAP } from '@/config/chains'

interface TransactionReviewProps {
  sweepPlan: SweepPlan | null
  sweepState: SweepState | null
  selectedTokens: ScannedToken[]
  destination: { chainId: number; address: string }
  isQuoting: boolean
  isExecuting: boolean
  onRefreshQuotes: () => void
  onStartSweep: () => void
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function truncateAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`
}

function phaseLabel(phase: SweepPhase): string {
  switch (phase) {
    case 'idle': return 'Idle'
    case 'quoting': return 'Fetching quotes…'
    case 'approving': return 'Approving tokens…'
    case 'swapping': return 'Swapping…'
    case 'bridging': return 'Bridging…'
    case 'complete': return 'Complete ✓'
    case 'error': return 'Error ✗'
  }
}

function phaseColor(phase: SweepPhase): string {
  switch (phase) {
    case 'complete': return '#4ade80' // green-400
    case 'error': return '#f87171'    // red-400
    case 'idle': return '#94a3b8'     // slate-400
    default: return '#BBB424'         // brand yellow
  }
}

export function TransactionReview({
  sweepPlan,
  sweepState,
  selectedTokens,
  destination,
  isQuoting,
  isExecuting,
  onRefreshQuotes,
  onStartSweep,
}: TransactionReviewProps) {
  const destChain = CHAIN_MAP[destination.chainId]
  const destChainName = destChain?.name ?? `Chain ${destination.chainId}`

  // ── 1. Loading / quoting state ──────────────────────────────────────────
  if (isQuoting) {
    return (
      <div className='py-8 flex flex-col items-center justify-center min-h-[400px] gap-6'>
        <div
          className='w-12 h-12 rounded-full border-4 border-t-transparent animate-spin'
          style={{ borderColor: '#BBB424', borderTopColor: 'transparent' }}
        />
        <p className='text-lg text-slate-300 font-tanklager'>Fetching fresh quotes…</p>
      </div>
    )
  }

  // ── 2. Group selected tokens by chain for the plan display ───────────────
  const tokensByChain = new Map<number, ScannedToken[]>()
  for (const t of selectedTokens) {
    const arr = tokensByChain.get(t.chainId) ?? []
    arr.push(t)
    tokensByChain.set(t.chainId, arr)
  }

  // Helper: find matching quote for a token
  function quoteFor(token: ScannedToken) {
    return sweepPlan?.quotes.find(
      (q) =>
        q.fromChainId === token.chainId &&
        (q.fromToken.toLowerCase() === token.address.toLowerCase() ||
          (token.address === '0x0' &&
            q.fromToken.toLowerCase() === '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'))
    )
  }

  // Execution progress %
  const totalTokens = sweepState?.chains.reduce((s, c) => s + c.tokensTotal, 0) ?? 0
  const completedTokens = sweepState?.chains.reduce((s, c) => s + c.tokensCompleted, 0) ?? 0
  const progressPct = totalTokens > 0 ? Math.round((completedTokens / totalTokens) * 100) : 0

  return (
    <div className='py-8 space-y-6'>
      <h2 className='text-3xl font-bold font-tanklager' style={{ color: '#BBB424' }}>
        Review Sweep
      </h2>

      {/* ── Execution progress (when sweep is running) ─────────────────── */}
      {isExecuting && sweepState && (
        <div className='bg-slate-800/50 rounded-xl p-6 space-y-4'>
          <h3 className='text-xl font-semibold font-tanklager'>Sweep in Progress</h3>

          {/* Overall progress bar */}
          <div className='w-full bg-slate-700 rounded-full h-3 overflow-hidden'>
            <div
              className='h-3 rounded-full transition-all duration-500'
              style={{ width: `${progressPct}%`, backgroundColor: '#BBB424' }}
            />
          </div>
          <p className='text-sm text-slate-400'>
            {completedTokens} / {totalTokens} tokens complete
          </p>

          {/* Per-chain status */}
          <div className='space-y-3'>
            {sweepState.chains.map((cs) => {
              const chain = CHAIN_MAP[cs.chainId]
              const chainName = chain?.name ?? `Chain ${cs.chainId}`
              return (
                <div
                  key={cs.chainId}
                  className='flex items-center justify-between rounded-lg px-4 py-3'
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <div>
                    <span className='font-medium'>{chainName}</span>
                    {cs.txHash && (
                      <span className='ml-2 text-xs text-slate-400 font-mono'>
                        {truncateAddress(cs.txHash)}
                      </span>
                    )}
                    {cs.error && (
                      <p className='text-xs mt-1' style={{ color: '#f87171' }}>{cs.error}</p>
                    )}
                  </div>
                  <span
                    className='text-sm font-tanklager font-semibold'
                    style={{ color: phaseColor(cs.phase) }}
                  >
                    {phaseLabel(cs.phase)}
                  </span>
                </div>
              )
            })}
          </div>

          {sweepState.phase === 'error' && (
            <div
              className='rounded-lg px-4 py-3 text-sm'
              style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171', border: '1px solid rgba(248,113,113,0.3)' }}
            >
              An error occurred during the sweep. Some chains may have completed successfully.
            </div>
          )}
        </div>
      )}

      {/* ── Execution plan (when sweep plan is available) ──────────────── */}
      {sweepPlan && !isExecuting && (
        <>
          {/* Per-chain token breakdown */}
          <div className='bg-slate-800/50 rounded-xl p-6 space-y-6'>
            <h3 className='text-xl font-semibold font-tanklager'>Token Breakdown</h3>

            {Array.from(tokensByChain.entries()).map(([chainId, tokens]) => {
              const chain = CHAIN_MAP[chainId]
              const chainName = chain?.name ?? `Chain ${chainId}`
              const chainValue = tokens.reduce((s, t) => s + (t.valueUsd ?? 0), 0)
              const chainGas = tokens.reduce((s, t) => {
                const q = quoteFor(t)
                return s + (q?.gasEstimateUsd ?? t.estimatedGasUsd ?? 0)
              }, 0)

              return (
                <div key={chainId} className='space-y-2'>
                  {/* Chain header */}
                  <div className='flex items-center justify-between text-sm font-tanklager font-semibold mb-1'>
                    <span style={{ color: '#BBB424' }}>{chainName}</span>
                    <span className='text-slate-400'>
                      subtotal: <span className='text-white'>${fmt(chainValue)}</span>
                    </span>
                  </div>

                  {/* Token rows */}
                  <div className='rounded-lg overflow-hidden' style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
                    {/* Header row */}
                    <div
                      className='grid grid-cols-4 gap-2 px-4 py-2 text-xs text-slate-400'
                      style={{ background: 'rgba(255,255,255,0.03)' }}
                    >
                      <span>Token</span>
                      <span className='text-right'>Balance</span>
                      <span className='text-right'>Value</span>
                      <span className='text-right'>Net Proceeds</span>
                    </div>

                    {tokens.map((token) => {
                      const q = quoteFor(token)
                      const gasUsd = q?.gasEstimateUsd ?? token.estimatedGasUsd ?? 0
                      const valueUsd = token.valueUsd ?? 0
                      const net = valueUsd - gasUsd

                      return (
                        <div
                          key={`${token.chainId}-${token.address}`}
                          className='grid grid-cols-4 gap-2 px-4 py-3 text-sm items-center'
                          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          <div className='flex items-center gap-2'>
                            {token.logoUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={token.logoUrl} alt={token.symbol} className='w-5 h-5 rounded-full' />
                            )}
                            <span className='font-medium'>{token.symbol}</span>
                          </div>
                          <span className='text-right text-slate-300 font-mono text-xs'>
                            {token.balanceFormatted}
                          </span>
                          <span className='text-right'>
                            {valueUsd > 0 ? `$${fmt(valueUsd)}` : '—'}
                          </span>
                          <span
                            className='text-right font-semibold'
                            style={{ color: net >= 0 ? '#4ade80' : '#f87171' }}
                          >
                            {valueUsd > 0 ? `$${fmt(net)}` : '—'}
                          </span>
                        </div>
                      )
                    })}

                    {/* Chain subtotal row */}
                    <div
                      className='grid grid-cols-4 gap-2 px-4 py-2 text-xs text-slate-400'
                      style={{ background: 'rgba(255,255,255,0.03)', borderTop: '1px solid rgba(255,255,255,0.08)' }}
                    >
                      <span className='font-tanklager'>Chain total</span>
                      <span />
                      <span className='text-right'>${fmt(chainValue)}</span>
                      <span className='text-right' style={{ color: '#4ade80' }}>
                        ${fmt(chainValue - chainGas)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary + Destination */}
          <div className='grid md:grid-cols-2 gap-4'>
            {/* Summary */}
            <div className='bg-slate-800/50 rounded-xl p-6 space-y-3'>
              <h3 className='text-lg font-semibold font-tanklager'>Summary</h3>
              <div className='flex justify-between text-sm'>
                <span className='text-slate-400'>Total value</span>
                <span className='font-semibold'>${fmt(sweepPlan.totalValueUsd)}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-slate-400'>Estimated gas</span>
                <span className='text-red-400'>-${fmt(sweepPlan.totalGasUsd)}</span>
              </div>
              <div
                className='flex justify-between text-sm pt-3 font-bold'
                style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}
              >
                <span>Net proceeds</span>
                <span style={{ color: '#BBB424' }}>${fmt(sweepPlan.netProceedsUsd)}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-slate-400'>Tokens</span>
                <span>{selectedTokens.length}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-slate-400'>Chains</span>
                <span>{tokensByChain.size}</span>
              </div>
            </div>

            {/* Destination */}
            <div className='bg-slate-800/50 rounded-xl p-6 space-y-3'>
              <h3 className='text-lg font-semibold font-tanklager'>Destination</h3>
              <div className='flex justify-between text-sm'>
                <span className='text-slate-400'>Network</span>
                <span
                  className='font-tanklager font-semibold'
                  style={{ color: '#BBB424' }}
                >
                  {destChainName}
                </span>
              </div>
              <div className='space-y-1'>
                <span className='text-xs text-slate-400'>Address</span>
                <p
                  className='font-mono text-xs break-all rounded-lg px-3 py-2'
                  style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  {destination.address || <span className='text-slate-500'>Not set</span>}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── No plan / empty state ──────────────────────────────────────────── */}
      {!sweepPlan && !isQuoting && (
        <div className='bg-slate-800/50 rounded-xl p-8 text-center space-y-4'>
          <p className='text-slate-400'>No quote data available.</p>
          <button
            type='button'
            onClick={onRefreshQuotes}
            className='px-6 py-2 rounded-lg text-sm font-semibold transition-all duration-200'
            style={{
              background: 'rgba(187,180,36,0.15)',
              border: '1px solid rgba(187,180,36,0.4)',
              color: '#BBB424',
            }}
          >
            Fetch Quotes
          </button>
        </div>
      )}

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      {!isExecuting && (
        <div className='flex flex-col sm:flex-row gap-3'>
          {/* Execute button */}
          <button
            type='button'
            onClick={onStartSweep}
            disabled={isQuoting || isExecuting || !sweepPlan}
            className='flex-1 px-6 py-4 font-bold text-lg uppercase rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed'
            style={{
              background: sweepPlan && !isQuoting ? '#BBB424' : 'rgba(187,180,36,0.3)',
              color: sweepPlan && !isQuoting ? '#000' : '#666',
            }}
          >
            Confirm &amp; Start Sweep
          </button>

          {/* Refresh quotes button */}
          <button
            type='button'
            onClick={onRefreshQuotes}
            disabled={isQuoting}
            className='px-6 py-4 font-semibold text-sm rounded-xl transition-all duration-200 disabled:opacity-50'
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#cbd5e1',
            }}
          >
            {isQuoting ? 'Refreshing…' : 'Refresh Quotes'}
          </button>
        </div>
      )}
    </div>
  )
}
