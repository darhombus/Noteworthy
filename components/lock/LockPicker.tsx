'use client'

import { useRef, useEffect } from 'react'
import { ShieldOff, Hash, KeyRound, Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'

export type LockType = 'none' | 'pin' | 'password'

interface LockPickerProps {
  /** Current lock type selection */
  lockType: LockType
  /** Called whenever type or secret changes */
  onChange: (lockType: LockType, secret: string) => void
}

export default function LockPicker({ lockType, onChange }: LockPickerProps) {
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [pinDigits, setPinDigits] = useState<[string, string, string, string]>(['', '', '', ''])
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  // Notify parent whenever selection or secret changes
  useEffect(() => {
    if (lockType === 'pin') {
      onChange('pin', pinDigits.join(''))
    } else if (lockType === 'password') {
      onChange('password', secret)
    } else {
      onChange('none', '')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockType, pinDigits, secret])

  function handleTypeChange(type: LockType) {
    // Reset inputs when switching
    setPinDigits(['', '', '', ''])
    setSecret('')
    onChange(type, '')
  }

  function handlePinDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...pinDigits] as [string, string, string, string]
    next[index] = digit
    setPinDigits(next)
    if (digit && index < 3) {
      pinRefs[index + 1].current?.focus()
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      pinRefs[index - 1].current?.focus()
    }
  }

  const options: { type: LockType; label: string; icon: React.ReactNode }[] = [
    { type: 'none', label: 'None', icon: <ShieldOff size={14} /> },
    { type: 'pin', label: '4-digit PIN', icon: <Hash size={14} /> },
    { type: 'password', label: 'Password', icon: <KeyRound size={14} /> },
  ]

  return (
    <div className="flex flex-col gap-3">
      {/* Option selector */}
      <div className="flex gap-1.5">
        {options.map((o) => (
          <button
            key={o.type}
            type="button"
            onClick={() => handleTypeChange(o.type)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
              lockType === o.type
                ? 'bg-[#1976D2] text-white border-[#1976D2]'
                : 'bg-transparent text-[var(--text-secondary)] border-[var(--border)] hover:border-[#1976D2] hover:text-[#1976D2]'
            }`}
          >
            {o.icon}
            <span className="hidden sm:inline">{o.label}</span>
          </button>
        ))}
      </div>

      {/* PIN input — 4 individual digit boxes */}
      {lockType === 'pin' && (
        <div className="flex items-center gap-2">
          {pinRefs.map((ref, i) => (
            <input
              key={i}
              ref={ref}
              type="password"
              inputMode="numeric"
              maxLength={1}
              value={pinDigits[i]}
              onChange={(e) => handlePinDigit(i, e.target.value)}
              onKeyDown={(e) => handlePinKeyDown(i, e)}
              className="w-12 h-12 text-center text-lg font-bold rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-transparent"
              placeholder="·"
              aria-label={`PIN digit ${i + 1}`}
            />
          ))}
          <span className="text-xs text-[var(--text-muted)] ml-1">4-digit PIN</span>
        </div>
      )}

      {/* Password input */}
      {lockType === 'password' && (
        <div className="relative">
          <input
            type={showSecret ? 'text' : 'password'}
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter a password…"
            autoComplete="new-password"
            className="w-full px-3 py-2 pr-10 rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] text-sm text-[var(--text-primary)] placeholder-[#9E9E9E] focus:outline-none focus:ring-2 focus:ring-[#1976D2] focus:border-transparent"
          />
          <button
            type="button"
            onClick={() => setShowSecret((v) => !v)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9E9E9E] hover:text-[var(--text-secondary)]"
            aria-label={showSecret ? 'Hide password' : 'Show password'}
          >
            {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>
      )}

      {lockType !== 'none' && (
        <p className="text-[11px] text-[var(--text-muted)]">
          {lockType === 'pin'
            ? 'You will need this PIN to open the content.'
            : 'You will need this password to open the content.'}
          {' '}There is no recovery — store it somewhere safe.
        </p>
      )}
    </div>
  )
}
