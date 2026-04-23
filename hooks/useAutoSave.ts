'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useDebounce } from './useDebounce'
import { updateEntry } from '@/lib/actions/entries'
import type { UpdateEntryInput } from '@/lib/validations/entries'

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

interface UseAutoSaveOptions {
  content: unknown
  entryId: string
  serverUpdatedAt: string
}

interface UseAutoSaveReturn {
  saveStatus: SaveStatus
  setSaveStatus: React.Dispatch<React.SetStateAction<SaveStatus>>
  conflictDetected: boolean
  dismissConflict: () => void
  forceSave: () => Promise<void>
  saveNow: () => Promise<void>
  /** Called when a realtime event reports this entry was updated elsewhere and
   *  the local tab has no dirty edits. Marks the passed payload as the new
   *  server-truth so the debounced save and pending-flip effects recognise the
   *  current content as already in sync and skip redundant writes. */
  applyServerUpdate: (newUpdatedAt: string, syncedContent: unknown) => void
  /** Opens the conflict dialog without attempting a save. Used when realtime
   *  tells us the server changed and we have dirty local edits. */
  triggerConflict: () => void
  /** Returns the `updated_at` the hook currently considers server-truth. Used
   *  by the realtime consumer to filter out echoes of its own saves. */
  getServerUpdatedAt: () => string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function useAutoSave({
  content,
  entryId,
  serverUpdatedAt,
}: UseAutoSaveOptions): UseAutoSaveReturn {
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [conflictDetected, setConflictDetected] = useState(false)

  const serverUpdatedAtRef = useRef(serverUpdatedAt)
  const latestContentRef = useRef(content)
  const saveStatusRef = useRef<SaveStatus>('idle')
  const isInitialContentRender = useRef(true)
  const isInitialDebounceRender = useRef(true)
  // Stringified snapshot of the content payload that matches what the server
  // currently has (set after a successful save or after accepting a remote
  // update via realtime). Used to short-circuit the pending flip and the
  // debounced save when local content equals server content — without this,
  // a realtime-driven apply would immediately fire a redundant UPDATE that
  // echoes back to the other tab and triggers a ping-pong loop.
  const syncedContentKeyRef = useRef<string | null>(null)

  // Always keep latest content in ref so forceSave/saveNow can use it
  useEffect(() => {
    latestContentRef.current = content
  })

  // Keep saveStatusRef in sync so the pagehide handler can read current status
  useEffect(() => {
    saveStatusRef.current = saveStatus
  }, [saveStatus])

  // Beacon save on tab close — fires fetch with keepalive:true so the browser
  // completes the request even after the page is unloaded
  useEffect(() => {
    function handlePageHide() {
      const status = saveStatusRef.current
      if (status !== 'pending' && status !== 'saving' && status !== 'error') return

      const body = JSON.stringify({
        ...(latestContentRef.current as Record<string, unknown>),
        updated_at: serverUpdatedAtRef.current,
      })

      fetch(`/api/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {
        // fire-and-forget — response is ignored on page hide
      })
    }

    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [entryId])

  // Beacon save on SPA navigation (component unmount) — handles sidebar links,
  // router.push calls from other components, and browser back button
  useEffect(() => {
    return () => {
      const status = saveStatusRef.current
      if (status !== 'pending' && status !== 'saving' && status !== 'error') return

      const body = JSON.stringify({
        ...(latestContentRef.current as Record<string, unknown>),
        updated_at: serverUpdatedAtRef.current,
      })

      fetch(`/api/entries/${entryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
        keepalive: true,
      }).catch(() => {})
    }
  }, [entryId])

  const debouncedContent = useDebounce(content, 3000)

  // Set 'pending' immediately when content changes (before debounce fires)
  useEffect(() => {
    if (isInitialContentRender.current) {
      isInitialContentRender.current = false
      return
    }
    if (!entryId) return
    // Only the idle/saved states can flip to pending — in any other state
    // setSaveStatus below is a no-op, so skip the stringify on hot keystroke
    // paths (pending → pending).
    const prevStatus = saveStatusRef.current
    if (prevStatus !== 'idle' && prevStatus !== 'saved') return
    // If the content matches what we know the server has, stay clean. This is
    // the case right after a successful save, or right after applying a remote
    // update via realtime.
    if (
      syncedContentKeyRef.current !== null &&
      JSON.stringify(content) === syncedContentKeyRef.current
    ) {
      return
    }
    setSaveStatus('pending')
  }, [content, entryId])

  // Perform save when debounced value settles
  useEffect(() => {
    if (isInitialDebounceRender.current) {
      isInitialDebounceRender.current = false
      return
    }
    if (!entryId) return

    let cancelled = false

    async function doSave() {
      // Bail if the content already matches what the server has — avoids a
      // redundant UPDATE that would echo back through realtime and loop.
      if (
        syncedContentKeyRef.current !== null &&
        JSON.stringify(latestContentRef.current) === syncedContentKeyRef.current
      ) {
        setSaveStatus('saved')
        return
      }
      setSaveStatus('saving')
      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return
        if (attempt > 0) await sleep(1000 * Math.pow(2, attempt - 1))
        if (cancelled) return

        const sentKey = JSON.stringify(latestContentRef.current)
        try {
          const result = await updateEntry(
            entryId,
            latestContentRef.current as UpdateEntryInput,
            serverUpdatedAtRef.current,
          )
          if (cancelled) return

          if ('conflict' in result) {
            setConflictDetected(true)
            setSaveStatus('idle')
            return
          }
          if ('success' in result) {
            serverUpdatedAtRef.current = result.updated_at
            syncedContentKeyRef.current = sentKey
            setSaveStatus('saved')
            return
          }
        } catch {
          // Network error — retry
        }
      }

      if (!cancelled) setSaveStatus('error')
    }

    doSave()
    return () => {
      cancelled = true
    }
  }, [debouncedContent, entryId])

  // Auto-dismiss 'saved' after 3 seconds
  useEffect(() => {
    if (saveStatus !== 'saved') return
    const timer = setTimeout(() => setSaveStatus('idle'), 3000)
    return () => clearTimeout(timer)
  }, [saveStatus])

  const performSave = useCallback(
    async (force: boolean) => {
      if (!entryId) return
      setSaveStatus('saving')
      const sentKey = JSON.stringify(latestContentRef.current)
      try {
        const result = await updateEntry(
          entryId,
          latestContentRef.current as UpdateEntryInput,
          serverUpdatedAtRef.current,
          force,
        )
        if ('conflict' in result) {
          setConflictDetected(true)
          setSaveStatus('idle')
        } else if ('success' in result) {
          serverUpdatedAtRef.current = result.updated_at
          syncedContentKeyRef.current = sentKey
          setSaveStatus('saved')
          if (force) setConflictDetected(false)
        } else {
          setSaveStatus('error')
        }
      } catch {
        setSaveStatus('error')
      }
    },
    [entryId],
  )

  const forceSave = useCallback(() => performSave(true), [performSave])
  const saveNow = useCallback(() => performSave(false), [performSave])
  const dismissConflict = useCallback(() => setConflictDetected(false), [])

  const applyServerUpdate = useCallback(
    (newUpdatedAt: string, syncedContent: unknown) => {
      serverUpdatedAtRef.current = newUpdatedAt
      syncedContentKeyRef.current = JSON.stringify(syncedContent)
      setSaveStatus('saved')
      setConflictDetected(false)
    },
    [],
  )

  const triggerConflict = useCallback(() => setConflictDetected(true), [])

  const getServerUpdatedAt = useCallback(() => serverUpdatedAtRef.current, [])

  return {
    saveStatus,
    setSaveStatus,
    conflictDetected,
    dismissConflict,
    forceSave,
    saveNow,
    applyServerUpdate,
    triggerConflict,
    getServerUpdatedAt,
  }
}
