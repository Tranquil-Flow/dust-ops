'use client';

import { isDemoMode } from '@/config/demo';

/**
 * DemoBanner — shown at the top of every page when demo mode is active.
 * Renders nothing in production.
 */
export function DemoBanner() {
  if (!isDemoMode()) return null;

  return (
    <div className="w-full bg-warning text-warning-content text-center text-sm font-semibold py-2 px-4 z-50">
      ⚠️ DEMO MODE — No real transactions
    </div>
  );
}
