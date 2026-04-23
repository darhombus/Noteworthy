'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * Invalidates the current route's server-rendered data whenever any of the
 * user's writable domain tables change (entries, journals, tags). Mount on
 * any page whose server component reads from one of these tables so the page
 * auto-refreshes when the user mutates data in another tab or device.
 *
 * Every table subscribed here must also be in the `supabase_realtime`
 * Postgres publication — see migrations 009 and 010. A missing publication
 * entry makes the subscription silently receive zero events.
 *
 * For per-entry editor sync (where a full route refresh would disturb the
 * cursor), use `useEntryRealtime` instead — it scopes to a single row and
 * applies the payload in place.
 */
export default function LiveDataRefresh() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()
    const refresh = () => router.refresh()

    const channel = supabase
      .channel('live-data')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'journals' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tags' }, refresh)
      .subscribe()

    // Safety net: refresh when the tab regains focus. Background tabs can miss
    // realtime events (throttled sockets, suspended clients after long idles),
    // so reconciling on return guarantees the user never sees stale data after
    // switching back from another tab.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [router])

  return null
}
