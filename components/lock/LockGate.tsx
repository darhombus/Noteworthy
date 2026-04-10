'use client'

import { useState } from 'react'
import LockScreen from './LockScreen'

interface LockGateProps {
  lockType: 'none' | 'pin' | 'password'
  entityId: string
  entityType: 'journal' | 'entry'
  entityName?: string
  children: React.ReactNode
}

/**
 * Wraps content that may be locked.  If lockType is 'none' or the user has
 * already unlocked during this session (tracked in sessionStorage), renders
 * children immediately.  Otherwise shows LockScreen and only reveals children
 * after a successful verification.
 */
export default function LockGate({
  lockType,
  entityId,
  entityType,
  entityName,
  children,
}: LockGateProps) {
  const storageKey = `nw:unlocked:${entityType}:${entityId}`

  const [unlocked, setUnlocked] = useState(() => {
    if (lockType === 'none') return true
    if (typeof window === 'undefined') return false
    return sessionStorage.getItem(storageKey) === '1'
  })

  if (unlocked) return <>{children}</>

  return (
    <LockScreen
      lockType={lockType as 'pin' | 'password'}
      entityId={entityId}
      entityType={entityType}
      entityName={entityName}
      onUnlock={() => {
        sessionStorage.setItem(storageKey, '1')
        setUnlocked(true)
      }}
    />
  )
}
