'use client'

import { useEffect } from 'react'
import { useUIStore } from '@/store/useUIStore'
import SearchOverlay from './SearchOverlayLazy'

/**
 * Tiny global anchor for the search overlay. Mounted unconditionally in
 * AppShell, but only ships the overlay's JS chunk when the user actually
 * opens it. The Cmd/Ctrl+K listener lives here so it stays active even
 * before the heavy overlay component is loaded.
 *
 * The original Cmd+K listener inside SearchOverlay remains in place (no
 * change to that file). Once the overlay mounts, both listeners are alive
 * but `openSearch()` is idempotent — calling it on an already-open overlay
 * is a no-op, so the redundancy is harmless.
 */
export default function SearchOverlayMount() {
  const isSearchOpen = useUIStore((s) => s.isSearchOpen)
  const openSearch = useUIStore((s) => s.openSearch)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        // Suppress the shortcut while the vault PIN/password screen is up.
        // VaultUnlockScreen / VaultSetupScreen set `hiddenVaultLocked=true`
        // on mount and clear it on unmount, so this flag is exactly the
        // "secret input is on screen" signal. Stealing focus to a search
        // input mid-PIN-entry would be a footgun.
        if (useUIStore.getState().hiddenVaultLocked) return
        e.preventDefault()
        openSearch()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [openSearch])

  if (!isSearchOpen) return null
  return <SearchOverlay />
}
