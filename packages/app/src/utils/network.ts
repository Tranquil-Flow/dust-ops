import {
  mainnet,
  base,
  optimism,
  arbitrum,
  polygon,
  scroll,
  linea,
  zkSync,
  unichain,
  type AppKitNetwork,
} from '@reown/appkit/networks'
import { SUPPORTED_CHAIN_IDS } from '../config/chains'

/**
 * All chains supported by dust-ops, sourced from the chain registry.
 * We map SUPPORTED_CHAIN_IDS to @reown/appkit network objects so the
 * wallet modal knows which networks to support.
 */
const APPKIT_NETWORKS_BY_ID: Record<number, AppKitNetwork> = {
  1: mainnet,
  8453: base,
  10: optimism,
  42161: arbitrum,
  137: polygon,
  534352: scroll,
  59144: linea,
  324: zkSync,
  1301: unichain,
}

export const ETH_CHAINS = SUPPORTED_CHAIN_IDS
  .map((id) => APPKIT_NETWORKS_BY_ID[id])
  .filter(Boolean) as AppKitNetwork[]

export const NETWORK_COLORS = {
  ethereum: {
    color: 'green',
    bgVariant: 'bg-green-600',
  },
  arbitrum: {
    color: 'sky',
    bgVariant: 'bg-sky-600',
  },
  base: {
    color: 'blue',
    bgVariant: 'bg-blue-600',
  },
  linea: {
    color: 'slate',
    bgVariant: 'bg-slate-600',
  },
  polygon: {
    color: 'purple',
    bgVariant: 'bg-purple-600',
  },
  optimism: {
    color: 'red',
    bgVariant: 'bg-red-600',
  },
  scroll: {
    color: 'amber',
    bgVariant: 'bg-amber-600',
  },
  zksync: {
    color: 'indigo',
    bgVariant: 'bg-indigo-600',
  },
  unichain: {
    color: 'pink',
    bgVariant: 'bg-pink-600',
  },
  other: {
    color: 'gray',
    bgVariant: 'bg-gray-600',
  },
}

export function GetNetworkColor(chain?: string, type: 'color' | 'bgVariant' = 'color') {
  chain = chain?.toLocaleLowerCase()
  if (chain === 'ethereum' || chain === 'mainnet' || chain === 'homestead') return NETWORK_COLORS.ethereum[type]
  if (chain?.includes('arbitrum')) return NETWORK_COLORS.arbitrum[type]
  if (chain?.includes('base')) return NETWORK_COLORS.base[type]
  if (chain?.includes('linea')) return NETWORK_COLORS.linea[type]
  if (chain?.includes('polygon') || chain?.includes('matic')) return NETWORK_COLORS.polygon[type]
  if (chain?.includes('optimism') || chain?.startsWith('op')) return NETWORK_COLORS.optimism[type]
  if (chain?.includes('scroll')) return NETWORK_COLORS.scroll[type]
  if (chain?.includes('zksync') || chain?.includes('era')) return NETWORK_COLORS.zksync[type]
  if (chain?.includes('unichain')) return NETWORK_COLORS.unichain[type]

  return NETWORK_COLORS.other[type]
}
