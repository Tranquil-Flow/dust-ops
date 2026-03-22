import { Connect } from '@/components/Connect'
import Link from 'next/link'
import { useAccount } from 'wagmi'

export function WalletConnection() {
  const { address } = useAccount()

  return (
    <div className='flex flex-col items-center justify-center min-h-screen text-center px-4'>
      <div className='w-full max-w-[224px] mx-auto mb-8 mt-[130px]'>
        <Connect />
      </div>

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
