'use client'

import { useEffect } from 'react'
import type { SaveStatus } from './useAutoSave'

export function useBeforeUnload(saveStatus: SaveStatus): void {
  useEffect(() => {
    const shouldWarn =
      saveStatus === 'pending' || saveStatus === 'saving' || saveStatus === 'error'
    if (!shouldWarn) return

    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [saveStatus])
}
