'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

/**
 * Globally dismiss any open Sonner toasts when the user clicks outside them.
 * Pairs with <Toaster /> in app/layout.tsx. The toast container is marked by
 * Sonner with `[data-sonner-toaster]`, and every toast card is `[data-sonner-toast]`
 * — treating either as "inside" keeps action-button clicks working.
 */
export default function ToastDismissOnOutsideClick() {
  useEffect(() => {
    function handlePointer(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-sonner-toaster], [data-sonner-toast]')) return
      toast.dismiss()
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [])

  return null
}
