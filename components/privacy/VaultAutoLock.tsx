'use client'

import { useEffect, useRef, useTransition } from 'react'
import { usePathname } from 'next/navigation'
import { hideBin, lockVault } from '@/lib/actions/vault'

/**
 * Mounted once in AppShell. Two independent auto-close behaviors:
 *
 *   1. Leaving /hidden  → lockVault()   (clears the vault cookie)
 *   2. Leaving /recycle-bin → hideBin() (clears the bin-reveal cookie)
 *
 * The two states are intentionally separate. Unlocking from the
 * recycle bin only opens a bin-reveal session — `/hidden` still
 * requires a real vault unlock — so each surface gets its own
 * navigation-bound auto-close. First mount is skipped on each ref so
 * deep-linking into either surface doesn't fire a "you just left"
 * close.
 */
export default function VaultAutoLock() {
  const pathname = usePathname()
  const wasInHiddenRef = useRef<boolean | null>(null)
  const wasInBinRef = useRef<boolean | null>(null)
  const [, startTransition] = useTransition()

  useEffect(() => {
    const inHidden = pathname === '/hidden' || pathname.startsWith('/hidden/')
    const inBin = pathname === '/recycle-bin' || pathname.startsWith('/recycle-bin/')

    if (wasInHiddenRef.current === null) {
      wasInHiddenRef.current = inHidden
    } else if (wasInHiddenRef.current && !inHidden) {
      startTransition(() => {
        lockVault().catch(() => {/* fire-and-forget */})
      })
      wasInHiddenRef.current = inHidden
    } else {
      wasInHiddenRef.current = inHidden
    }

    if (wasInBinRef.current === null) {
      wasInBinRef.current = inBin
    } else if (wasInBinRef.current && !inBin) {
      startTransition(() => {
        hideBin().catch(() => {/* fire-and-forget */})
      })
      wasInBinRef.current = inBin
    } else {
      wasInBinRef.current = inBin
    }
  }, [pathname])

  return null
}
