'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import LockScreen from './LockScreen'

interface LockGateProps {
  lockType: 'none' | 'pin' | 'password'
  entityId: string
  entityType: 'journal' | 'entry'
  entityName?: string
  /** Auto-lock after this many minutes of inactivity. 0 disables auto-lock. */
  autoLockMinutes?: number
  children: React.ReactNode
}

const ACTIVITY_EVENTS = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
] as const

/**
 * Wraps content that may be locked. If lockType is 'none', children render
 * immediately. Otherwise LockScreen is shown and children only appear after a
 * successful verification for this specific mount — navigating away and back
 * re-prompts, since the unlocked flag lives only in component state.
 *
 * Once unlocked, an inactivity timer auto-relocks the gate after
 * `autoLockMinutes` of no user input. Pass 0 to disable.
 */
export default function LockGate({
  lockType,
  entityId,
  entityType,
  entityName,
  autoLockMinutes = 5,
  children,
}: LockGateProps) {
  const [unlocked, setUnlocked] = useState(lockType === 'none')
  const [effectiveMinutes, setEffectiveMinutes] = useState(autoLockMinutes)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // If the page re-renders with a new prop (e.g. fresh server fetch), follow it.
  useEffect(() => {
    setEffectiveMinutes(autoLockMinutes)
  }, [autoLockMinutes])

  // Live updates from the Settings page — same tab via CustomEvent,
  // cross-tab via BroadcastChannel.
  useEffect(() => {
    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail
      if (typeof detail === 'number') setEffectiveMinutes(detail)
    }
    window.addEventListener('nw:auto-lock-changed', onLocal)

    let channel: BroadcastChannel | null = null
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('nw:preferences')
      channel.onmessage = (msg) => {
        const next = msg.data?.autoLockMinutes
        if (typeof next === 'number') setEffectiveMinutes(next)
      }
    }

    return () => {
      window.removeEventListener('nw:auto-lock-changed', onLocal)
      channel?.close()
    }
  }, [])

  useEffect(() => {
    if (lockType === 'none' || !unlocked || effectiveMinutes <= 0) return

    const ms = effectiveMinutes * 60 * 1000

    const reset = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        setUnlocked(false)
        toast.info(
          `Locked ${entityType} after inactivity. Re-enter your ${
            lockType === 'pin' ? 'PIN' : 'password'
          } to continue.`,
        )
      }, ms)
    }

    ACTIVITY_EVENTS.forEach((e) =>
      window.addEventListener(e, reset, { passive: true }),
    )
    window.addEventListener('nw:activity', reset)
    reset()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, reset))
      window.removeEventListener('nw:activity', reset)
    }
  }, [unlocked, lockType, entityType, effectiveMinutes])

  if (unlocked) return <>{children}</>

  return (
    <LockScreen
      lockType={lockType as 'pin' | 'password'}
      entityId={entityId}
      entityType={entityType}
      entityName={entityName}
      onUnlock={() => setUnlocked(true)}
    />
  )
}
