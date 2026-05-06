'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { lockVault, touchVault } from '@/lib/actions/vault'

/** Activity events that count as the user "still being there". Mirrors
 *  the auth-side InactivityModal so the two timers respond to the same
 *  signals — there's no scenario where one resets and the other doesn't. */
const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
] as const

/** Throttle for server-side cookie refreshes. Smaller than the smallest
 *  allowed lock window (1 minute) by a wide margin so the cookie's
 *  effective expiry trails the client's last-activity timestamp by at
 *  most this amount — keeps the in-tab setTimeout and the cookie from
 *  drifting apart noticeably. */
const TOUCH_THROTTLE_MS = 10_000

interface Props {
  /** profiles.vault_auto_lock_minutes for the current user. The guard
   *  uses it to size the inactivity timer; the server uses the same
   *  field to set the cookie expiry inside `touchVault`. */
  autoLockMinutes: number
}

/**
 * Inactivity-driven auto-lock for the Hidden vault.
 *
 * Mounted in `app/(app)/hidden/layout.tsx` whenever the vault is open.
 * Listens for any user input on the page and behaves as follows:
 *
 *   • On every activity event it (a) resets a setTimeout that fires at
 *     `autoLockMinutes` from now and (b) — at most once per
 *     TOUCH_THROTTLE_MS — calls `touchVault()` so the server cookie's
 *     expiry slides forward in lockstep with the client timer.
 *   • If the timeout fires (i.e. no activity for the configured
 *     window), it calls `lockVault()` and pushes the user to /hidden,
 *     which renders the unlock screen.
 *   • When the tab becomes visible again, it does a `router.refresh()`
 *     so a cookie that expired in the background is detected on the
 *     next render even if the in-page setTimeout was paused by the
 *     browser.
 *
 * The component renders nothing.
 */
export default function VaultIdleGuard({ autoLockMinutes }: Props) {
  const router = useRouter()
  const lastTouchAt = useRef(0)
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const idleMs = Math.max(60_000, autoLockMinutes * 60_000)

    let cancelled = false

    function clearLockTimer() {
      if (lockTimer.current) {
        clearTimeout(lockTimer.current)
        lockTimer.current = null
      }
    }

    function scheduleLock() {
      clearLockTimer()
      lockTimer.current = setTimeout(async () => {
        if (cancelled) return
        try {
          await lockVault()
        } catch {
          /* no-op — the redirect below still leaves the vault
             effectively locked because the user is no longer on a
             /hidden route. */
        }
        // Auto-lock bounces the user out of the Hidden surface
        // entirely. Dashboard is the friendliest landing — the
        // unlock screen at /hidden would feel adversarial after an
        // idle timeout, since the user wasn't actively trying to
        // read hidden content.
        router.push('/dashboard')
      }, idleMs)
    }

    async function refreshCookieIfDue() {
      const now = Date.now()
      if (now - lastTouchAt.current < TOUCH_THROTTLE_MS) return
      lastTouchAt.current = now
      try {
        const result = await touchVault()
        if (cancelled) return
        if ('error' in result) {
          // The cookie expired before the next activity tick reached
          // the server (background tab, suspended timer, …). Bounce
          // immediately rather than waiting for the local setTimeout.
          router.push('/hidden')
        }
      } catch {
        /* network blip — ignored, the next activity will retry */
      }
    }

    function handleActivity() {
      if (cancelled) return
      scheduleLock()
      void refreshCookieIfDue()
    }

    function handleVisibility() {
      if (document.visibilityState !== 'visible') return
      // Returning to the tab: re-render so a server-side `isVaultOpen()`
      // check runs against the current cookie. If it expired while the
      // tab was hidden the page redirects to /hidden naturally.
      router.refresh()
      handleActivity()
    }

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, handleActivity, { passive: true }),
    )
    document.addEventListener('visibilitychange', handleVisibility)

    // Prime the timer on mount — the user just unlocked or just
    // navigated into /hidden, both of which count as activity.
    handleActivity()

    return () => {
      cancelled = true
      clearLockTimer()
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, handleActivity))
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [autoLockMinutes, router])

  return null
}
