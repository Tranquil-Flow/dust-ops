import { CheckIcon } from '@heroicons/react/24/outline'
import { useRouter } from 'next/navigation'
import type { Token } from '@/atoms/walletAtoms'

interface SweepCompletionProps {
  selectedTokens?: Token[]
}

export function SweepCompletion({ selectedTokens = [] }: SweepCompletionProps) {
  const router = useRouter()

  // Calculate total deposited amount from selected tokens
  const depositedAmount = selectedTokens.reduce((sum, token) => {
    const value = parseFloat(token.value.replace('$', '').replace(',', '') || '0')
    return sum + value
  }, 0)

  const handleReturnHome = () => {
    router.push('/')
  }

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
        <h2 className='text-4xl font-bold mb-4 font-tanklager'>Completion</h2>
        <p className='text-slate-300 text-lg font-tanklager mb-4'>
          Your tokens have been successfully swept!
        </p>
        {depositedAmount > 0 && (
          <p className='text-slate-400 text-base font-tanklager mb-8'>
            Total value swept: <span style={{ color: '#BBB424' }}>${depositedAmount.toLocaleString()}</span>
          </p>
        )}

        <button
          onClick={handleReturnHome}
          className='px-8 py-4 font-semibold transition-all text-lg btn-review-sweep'
          style={{ borderRadius: '0.75rem' }}>
          <span className='uppercase text-white font-bold'>START NEW SWEEP</span>
        </button>
      </div>
    </div>
  )
}
