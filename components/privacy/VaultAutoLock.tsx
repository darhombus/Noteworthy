'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { lockVault } from '@/lib/actions/privacy'

// The vault is only allowed to stay open under /hidden/**. All hidden
// content now lives on dedicated routes (/hidden/journals/<jid>,
// /hidden/journals/<jid>/entries/<eid>, /hidden/entries/<eid>), so any
// navigation outside /hidden is a clear signal to lock.
//
// The server action is cheap (writes one cookie) and idempotent when no
// vault is open, so firing on every disallowed route transition is safe.
function isAllowedPath(pathname: string): boolean {
  return pathname === '/hidden' || pathname.startsWith('/hidden/')
}

export default function VaultAutoLock() {
  const pathname = usePathname()
  const prev = useRef<string | null>(null)

  useEffect(() => {
    const previous = prev.current
    prev.current = pathname

    // On first mount, don't lock — user may have just landed on /hidden or
    // deep-linked into a hidden item. Only act on real path transitions.
    if (previous === null) return
    if (previous === pathname) return

    if (!isAllowedPath(pathname)) {
      void lockVault()
    }
  }, [pathname])

  return null
}
