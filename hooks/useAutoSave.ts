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

  const debouncedContent = useDebounce(content, 3000)

  // Set 'pending' immediately when content changes (before debounce fires)
  useEffect(() => {
    if (isInitialContentRender.current) {
      isInitialContentRender.current = false
      return
    }
    if (!entryId) return
    setSaveStatus((prev) => (prev === 'idle' || prev === 'saved' ? 'pending' : prev))
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
      setSaveStatus('saving')

      for (let attempt = 0; attempt < 3; attempt++) {
        if (cancelled) return
        if (attempt > 0) await sleep(1000 * Math.pow(2, attempt - 1))
        if (cancelled) return

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

  return { saveStatus, setSaveStatus, conflictDetected, dismissConflict, forceSave, saveNow }
}
