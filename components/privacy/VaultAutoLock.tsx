'use client'

import { useEffect, useRef, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { lockVault } from '@/lib/actions/vault'

/**
 * Mounted once in AppShell. When the user navigates AWAY from /hidden
 * or any /hidden/** route, fires lockVault() to clear the cookie. The
 * first mount is skipped so deep-linking into /hidden/<jid> doesn't
 * race the page through a "you just left" transition.
 */
export default function VaultAutoLock() {
  const pathname = usePathname()
  const wasInHiddenRef = useRef<boolean | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const inHidden = pathname === '/hidden' || pathname.startsWith('/hidden/')

    // Skip first mount — we don't know where the user came from.
    if (wasInHiddenRef.current === null) {
      wasInHiddenRef.current = inHidden
      return
    }

    if (wasInHiddenRef.current && !inHidden) {
      startTransition(() => {
        lockVault().catch(() => {/* fire-and-forget */})
      })
    }

    wasInHiddenRef.current = inHidden
  }, [pathname])

  return null
}
