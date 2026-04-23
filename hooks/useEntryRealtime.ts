'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'

type EntryRow = Database['public']['Tables']['entries']['Row']

/**
 * Subscribes to UPDATE events for a single entries row. Fires the callback
 * whenever another tab or device writes to this entry so the editor can either
 * apply the change in place (when clean) or surface the existing conflict
 * dialog (when dirty).
 *
 * The consumer's callback is stored in a ref so it can close over current
 * state without forcing a re-subscription on every render.
 */
export function useEntryRealtime(
  entryId: string,
  onRemoteUpdate: (newRow: EntryRow) => void,
) {
  const callbackRef = useRef(onRemoteUpdate)
  useEffect(() => {
    callbackRef.current = onRemoteUpdate
  })

  useEffect(() => {
    if (!entryId) return
    const supabase = createClient()
    const channel = supabase
      .channel(`entry-${entryId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'entries',
          filter: `entry_id=eq.${entryId}`,
        },
        (payload) => {
          callbackRef.current(payload.new as EntryRow)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [entryId])
}
