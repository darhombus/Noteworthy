'use client'

import dynamic from 'next/dynamic'

const SearchOverlay = dynamic(() => import('./SearchOverlay'), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
      <div
        className="relative w-full max-w-2xl mx-4 bg-[var(--bg-surface)] rounded-xl shadow-2xl border border-[var(--border)] overflow-hidden flex items-center justify-center"
        style={{ minHeight: 140 }}
      >
        <div
          className="h-5 w-5 rounded-full border-2 border-[var(--border)] border-t-[#1976D2] animate-spin"
          aria-label="Loading search"
        />
      </div>
    </div>
  ),
})

/** Warm the SearchOverlay chunk. Safe to call repeatedly — the browser
 *  and bundler cache the dynamic import, so subsequent calls are no-ops.
 *  Wire to `onPointerEnter` / `onFocus` on anything that opens search. */
export function prefetchSearchOverlay(): void {
  void import('./SearchOverlay')
}

export default SearchOverlay
