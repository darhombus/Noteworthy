'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { signOutAction } from '@/lib/actions/auth'

const INACTIVITY_MS = 30 * 60 * 1000 // 30 minutes
const COUNTDOWN_SEC = 60
const EVENTS = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart', 'click'] as const

/** Call this from anywhere (e.g. after an API call) to reset the inactivity timer. */
export function resetInactivityTimer() {
  window.dispatchEvent(new CustomEvent('nw:activity'))
}

export default function InactivityModal() {
  const [showModal, setShowModal] = useState(false)
  const [countdown, setCountdown] = useState(COUNTDOWN_SEC)

  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const isModalOpen = useRef(false)

  const clearAll = useCallback(() => {
    if (inactivityTimer.current) clearTimeout(inactivityTimer.current)
    if (countdownTimer.current) clearInterval(countdownTimer.current)
  }, [])

  const handleLogout = useCallback(async () => {
    clearAll()
    isModalOpen.current = false
    setShowModal(false)
    await signOutAction()
  }, [clearAll])

  const startInactivityTimer = useCallback(() => {
    if (isModalOpen.current) return
    clearAll()
    inactivityTimer.current = setTimeout(() => {
      isModalOpen.current = true
      setShowModal(true)
      setCountdown(COUNTDOWN_SEC)
      countdownTimer.current = setInterval(() => {
        setCountdown((prev) => (prev <= 1 ? 0 : prev - 1))
      }, 1000)
    }, INACTIVITY_MS)
  }, [clearAll])

  // Auto-logout when countdown reaches 0
  useEffect(() => {
    if (showModal && countdown === 0) {
      handleLogout()
    }
  }, [showModal, countdown, handleLogout])

  const handleStayLoggedIn = useCallback(() => {
    isModalOpen.current = false
    setShowModal(false)
    clearAll()
    startInactivityTimer()
  }, [clearAll, startInactivityTimer])

  // Dismissing the modal (Escape or backdrop click) is itself a clear sign
  // the user is back at the keyboard — treat it the same as "Stay logged in"
  // rather than letting the countdown finish and log them out.
  useEffect(() => {
    if (!showModal) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleStayLoggedIn()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showModal, handleStayLoggedIn])

  useEffect(() => {
    const onActivity = () => startInactivityTimer()

    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))
    window.addEventListener('nw:activity', onActivity)
    startInactivityTimer()

    return () => {
      clearAll()
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity))
      window.removeEventListener('nw:activity', onActivity)
    }
  }, [startInactivityTimer, clearAll])

  if (!showModal) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleStayLoggedIn() }}
    >
      <div className="w-full max-w-sm mx-4 bg-[var(--bg-surface)] rounded-xl shadow-lg border border-[var(--border)] p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Still there?
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">
          You&apos;ve been inactive for 30 minutes. You&apos;ll be logged out in{' '}
          <span className="font-semibold text-gray-900 dark:text-white">{countdown}s</span>.
        </p>
        <div className="flex gap-3">
          <button
            onClick={handleStayLoggedIn}
            className="flex-1 py-2.5 bg-[#1976D2] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Stay logged in
          </button>
          <button
            onClick={handleLogout}
            className="flex-1 py-2.5 border border-[var(--border)] text-gray-700 dark:text-[#BDBDBD] rounded-lg font-medium text-sm hover:bg-[var(--bg-muted)] transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
