/**
 * Demo mode feature flag.
 *
 * Enable via:
 *   - Environment variable: NEXT_PUBLIC_DEMO_MODE=true
 *   - URL query param: ?demo=true
 */

export const DEMO_WALLET_ADDRESS = '0x1234567890abcdef1234567890abcdef12345678';

export function isDemoMode(): boolean {
  // Environment variable check (works both server-side and client-side)
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return true;
  }

  // URL query param check (client-side only)
  if (
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('demo') === 'true'
  ) {
    return true;
  }

  return false;
}
