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
 * Wraps content that may be locked. If lockType is 'none', children render
 * immediately. Otherwise LockScreen is shown and children only appear after a
 * successful verification for this specific mount — navigating away and back
 * re-prompts, since the unlocked flag lives only in component state.
 */
export default function LockGate({
  lockType,
  entityId,
  entityType,
  entityName,
  children,
}: LockGateProps) {
  const [unlocked, setUnlocked] = useState(lockType === 'none')

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
