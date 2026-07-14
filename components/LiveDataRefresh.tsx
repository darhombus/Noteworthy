'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface LiveDataRefreshProps {
  userId: string
}

// Opt-in by env var. Global router.refresh() calls clear the App Router client
// cache, so leaving this always-on can make navigation feel perpetually cold.
const LIVE_REFRESH_ENABLED = process.env.NEXT_PUBLIC_NW_LIVE_REFRESH === '1'

export default function LiveDataRefresh({ userId }: LiveDataRefreshProps) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!LIVE_REFRESH_ENABLED) return

    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    let visibilityRefreshTimer: ReturnType<typeof setTimeout> | null = null
    let pendingWhileHidden = false
    let lastRefreshAt = 0
    let lastRouteChangeAt = Date.now()

    const DEBOUNCE_MS = 400
    const MIN_REFRESH_GAP_MS = 2500
    const NAVIGATION_GUARD_MS = 1500

    const isLiveRoute = () =>
      pathname.startsWith('/journals') ||
      pathname.startsWith('/hidden') ||
      pathname.startsWith('/tags') ||
      pathname.startsWith('/dashboard') ||
      pathname.startsWith('/analytics') ||
      pathname.startsWith('/recycle-bin')

    const runRefresh = () => {
      // Avoid forcing a second server pass immediately after a transition.
      if (Date.now() - lastRouteChangeAt < NAVIGATION_GUARD_MS) return

      const now = Date.now()
      const elapsed = now - lastRefreshAt
      if (elapsed < MIN_REFRESH_GAP_MS) {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          timer = null
          lastRefreshAt = Date.now()
          router.refresh()
        }, MIN_REFRESH_GAP_MS - elapsed)
        return
      }

      lastRefreshAt = now
      router.refresh()
    }

    const refresh = () => {
      if (!isLiveRoute()) return
      if (document.visibilityState !== 'visible') {
        pendingWhileHidden = true
        return
      }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        runRefresh()
      }, DEBOUNCE_MS)
    }

    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !pendingWhileHidden) return
      pendingWhileHidden = false
      if (visibilityRefreshTimer) clearTimeout(visibilityRefreshTimer)
      visibilityRefreshTimer = setTimeout(() => {
        visibilityRefreshTimer = null
        runRefresh()
      }, 150)
    }

    // Mark route transition boundaries so updates that fire right after
    // navigation don't trigger duplicate route fetches.
    lastRouteChangeAt = Date.now()

    const channel = supabase
      .channel(`live-data:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'entries', filter: `user_id=eq.${userId}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'journals', filter: `user_id=eq.${userId}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tags', filter: `user_id=eq.${userId}` },
        refresh,
      )
      .subscribe()

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      if (timer) clearTimeout(timer)
      if (visibilityRefreshTimer) clearTimeout(visibilityRefreshTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      supabase.removeChannel(channel)
    }
  }, [pathname, router, userId])

  return null
}
