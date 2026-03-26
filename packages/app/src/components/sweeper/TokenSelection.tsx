import { ChevronRightIcon } from '@heroicons/react/24/outline'
import { CHAINS } from '@/config/chains'
import type { ScannedToken } from '@/config/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChainGroup {
  chainId: number
  chainName: string
  tokens: ScannedToken[]
}

interface Totals {
  valueUsd: number
  gasUsd: number
  netUsd: number
}

interface TokenSelectionProps {
  tokensByChain: ChainGroup[]
  selectedKeys: Set<string>
  destination: { chainId: number; address: string }
  totals: Totals
  onToggleToken: (key: string) => void
  onDestinationChainChange: (chainId: number) => void
  onDestinationAddressChange: (address: string) => void
  onProceed: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function tokenKey(t: ScannedToken): string {
  return `${t.chainId}-${t.address}`
}

function fmt(n: number | null | undefined, digits = 2): string {
  if (n == null) return '—'
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ViabilityBadge({ viability }: { viability: ScannedToken['viability'] }) {
  if (viability === 'sweepable') return null
  const label = viability === 'uneconomic' ? 'gas > value' : 'no liquidity'
  const bg = viability === 'uneconomic' ? 'bg-orange-800' : 'bg-slate-700'
  return (
    <span
      className={`text-xs px-2 py-0.5 font-mono uppercase tracking-wide text-slate-300 ${bg}`}
      style={{ borderRadius: '0px' }}
    >
      {label}
    </span>
  )
}

function TokenRow({
  token,
  isSelected,
  onToggle,
}: {
  token: ScannedToken
  isSelected: boolean
  onToggle: () => void
}) {
  const isSweepable = token.viability === 'sweepable'
  const dimmed = !isSweepable

  return (
    <div
      onClick={isSweepable ? onToggle : undefined}
      className={`p-4 border-2 transition-all token-selection-box ${
        dimmed
          ? 'opacity-40 cursor-not-allowed'
          : isSelected
          ? 'selected cursor-pointer'
          : 'cursor-pointer'
      }`}
      style={{
        borderRadius: '0px',
        borderColor: isSelected ? '#BBB424' : dimmed ? '#334155' : '#475569',
      }}
    >
      <div className='flex items-center justify-between'>
        {/* Left: indicator + info */}
        <div className='flex items-center space-x-4'>
          {/* Square selection indicator */}
          <div
            className='w-3 h-3 shrink-0'
            style={{
              borderRadius: '0px',
              backgroundColor: isSelected
                ? '#BBB424'
                : isSweepable
                ? '#475569'
                : 'rgba(255,255,255,0.15)',
            }}
          />

          <div>
            <div className='flex items-center flex-wrap gap-2'>
              {token.logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={token.logoUrl}
                  alt={token.symbol}
                  className='w-5 h-5 rounded-full'
                />
              )}
              <span className='font-semibold'>{token.symbol}</span>
              <ViabilityBadge viability={token.viability} />
            </div>
            <p className='text-sm text-slate-400'>{token.name}</p>
          </div>
        </div>

        {/* Right: value + balance */}
        <div className='text-right shrink-0 ml-4'>
          <p className='font-semibold'>
            {token.valueUsd != null ? `$${fmt(token.valueUsd)}` : '—'}
          </p>
          <p className='text-sm text-slate-400'>{token.balanceFormatted}</p>
          {token.estimatedGasUsd != null && (
            <p className='text-xs text-slate-500'>
              gas ~${fmt(token.estimatedGasUsd)}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TokenSelection({
  tokensByChain,
  selectedKeys,
  destination,
  totals,
  onToggleToken,
  onDestinationChainChange,
  onDestinationAddressChange,
  onProceed,
}: TokenSelectionProps) {
  const totalTokens = tokensByChain.reduce((s, g) => s + g.tokens.length, 0)
  const selectedCount = selectedKeys.size

  return (
    <div className='py-8'>
      {/* ── Header row ─────────────────────────────────────────────────────── */}
      <div className='grid grid-cols-2 gap-8 items-end mb-8'>
        <div>
          <h2 className='text-3xl font-bold mb-2'>Select Tokens to Sweep</h2>
          <p className='text-slate-300'>
            {selectedCount} of {totalTokens} tokens selected · total value{' '}
            <span className='font-semibold' style={{ color: '#BBB424' }}>
              ${fmt(totals.valueUsd)}
            </span>
          </p>
        </div>

        <div>
          <button
            onClick={onProceed}
            disabled={selectedCount === 0}
            className='cursor-pointer w-full disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 font-semibold transition-all flex items-center justify-center btn-review-sweep'
            style={{ borderRadius: '0px' }}
          >
            <span className='uppercase text-white font-bold'>
              Review &amp; Sweep Selected Tokens
            </span>
            <ChevronRightIcon className='w-5 h-5 ml-2 text-white' />
          </button>
        </div>
      </div>

      {/* ── Destination ────────────────────────────────────────────────────── */}
      <div
        className='border border-slate-700 p-6 mb-8 grid grid-cols-1 gap-4 md:grid-cols-2'
        style={{ borderRadius: '0px' }}
      >
        <div>
          <label className='block text-xs uppercase tracking-widest text-slate-400 mb-2 font-mono'>
            Destination Chain
          </label>
          <select
            value={destination.chainId}
            onChange={(e) => onDestinationChainChange(Number(e.target.value))}
            className='select w-full bg-slate-800 border border-slate-600 text-white'
            style={{ borderRadius: '0px' }}
          >
            {CHAINS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className='block text-xs uppercase tracking-widest text-slate-400 mb-2 font-mono'>
            Destination Address
          </label>
          <input
            type='text'
            value={destination.address}
            onChange={(e) => onDestinationAddressChange(e.target.value)}
            placeholder='0x…'
            className='input w-full bg-slate-800 border border-slate-600 text-white font-mono text-sm'
            style={{ borderRadius: '0px' }}
          />
        </div>
      </div>

      {/* ── Token list grouped by chain ────────────────────────────────────── */}
      {totalTokens === 0 ? (
        <div className='text-center py-16 text-slate-500'>
          <p className='text-lg mb-2'>No tokens found.</p>
          <p className='text-sm'>Connect a wallet and scan to discover dust tokens.</p>
        </div>
      ) : (
        <div className='space-y-8 mb-8'>
          {tokensByChain.map(({ chainId, chainName, tokens }) => (
            <div key={chainId}>
              {/* Chain header */}
              <div
                className='px-4 py-2 mb-3 bg-slate-800 border-l-4 flex items-center gap-3'
                style={{ borderRadius: '0px', borderLeftColor: '#BBB424' }}
              >
                <span className='font-bold text-sm uppercase tracking-widest text-slate-200'>
                  {chainName}
                </span>
                <span className='text-xs text-slate-500 font-mono'>
                  {tokens.length} token{tokens.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Tokens */}
              <div className='grid gap-3'>
                {tokens.map((token) => {
                  const key = tokenKey(token)
                  return (
                    <TokenRow
                      key={key}
                      token={token}
                      isSelected={selectedKeys.has(key)}
                      onToggle={() => onToggleToken(key)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary bar ────────────────────────────────────────────────────── */}
      {selectedCount > 0 && (
        <div
          className='border border-slate-700 p-5 grid grid-cols-3 gap-6 text-center mb-8'
          style={{ borderRadius: '0px' }}
        >
          <div>
            <p className='text-xs uppercase tracking-widest text-slate-400 font-mono mb-1'>
              Total Value
            </p>
            <p className='text-xl font-bold' style={{ color: '#BBB424' }}>
              ${fmt(totals.valueUsd)}
            </p>
          </div>
          <div>
            <p className='text-xs uppercase tracking-widest text-slate-400 font-mono mb-1'>
              Est. Gas
            </p>
            <p className='text-xl font-bold text-orange-400'>
              −${fmt(totals.gasUsd)}
            </p>
          </div>
          <div>
            <p className='text-xs uppercase tracking-widest text-slate-400 font-mono mb-1'>
              Net Proceeds
            </p>
            <p
              className='text-xl font-bold'
              style={{ color: totals.netUsd >= 0 ? '#BBB424' : '#f87171' }}
            >
              ${fmt(totals.netUsd)}
            </p>
          </div>
        </div>
      )}

      {/* ── Bottom proceed button ───────────────────────────────────────────── */}
      <button
        onClick={onProceed}
        disabled={selectedCount === 0}
        className='cursor-pointer w-full disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 font-semibold transition-all flex items-center justify-center btn-review-sweep'
        style={{ borderRadius: '0px' }}
      >
        <span className='uppercase text-white font-bold'>
          Review &amp; Sweep {selectedCount > 0 ? `${selectedCount} ` : ''}Token
          {selectedCount !== 1 ? 's' : ''}
        </span>
        <ChevronRightIcon className='w-5 h-5 ml-2 text-white' />
      </button>
    </div>
  )
}
