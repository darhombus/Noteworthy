'use client'

import { useRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface SecretInputProps {
  lockType: 'pin' | 'password'
  value: string
  onChange: (v: string) => void
  error?: boolean
  autoFocus?: boolean
  showPassword?: boolean
  onToggleShow?: () => void
  /**
   * Fires on Enter (password) or auto-submit when the 4th PIN digit lands.
   * Receives the full value directly — callers must use this rather than
   * the `value` prop, which is still stale at auto-submit time because the
   * parent's `onChange` state update hasn't flushed yet.
   */
  onEnter?: (value: string) => void
}

/**
 * Compact secret-input widget shared by flows that need the user to retype
 * an existing PIN or password (change-lock, remove-lock). Renders 4 digit
 * boxes for PIN or a single field for password.
 */
export default function SecretInput({
  lockType,
  value,
  onChange,
  error,
  autoFocus,
  showPassword,
  onToggleShow,
  onEnter,
}: SecretInputProps) {
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  if (lockType === 'pin') {
    const digits: [string, string, string, string] = [
      value[0] ?? '',
      value[1] ?? '',
      value[2] ?? '',
      value[3] ?? '',
    ]

    function handleDigit(index: number, raw: string) {
      const digit = raw.replace(/\D/g, '').slice(-1)
      const next = [...digits] as [string, string, string, string]
      next[index] = digit
      onChange(next.join(''))
      if (digit && index < 3) pinRefs[index + 1].current?.focus()
      if (digit && index === 3 && onEnter) {
        const full = next.join('')
        if (full.length === 4) onEnter(full)
      }
    }

    function handleKey(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        const next = [...digits] as [string, string, string, string]
        next[index - 1] = ''
        onChange(next.join(''))
        pinRefs[index - 1].current?.focus()
      }
    }

    return (
      <div className="flex gap-2">
        {pinRefs.map((ref, i) => (
          <input
            key={i}
            ref={ref}
            type="password"
            inputMode="numeric"
            maxLength={1}
            value={digits[i]}
            onChange={(e) => handleDigit(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            autoFocus={autoFocus && i === 0}
            className={`w-11 h-11 text-center text-lg font-bold rounded-lg border-2 bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none transition-colors ${
              error
                ? 'border-red-400 dark:border-red-500'
                : 'border-[var(--border)] focus:border-[#1976D2]'
            }`}
            placeholder="·"
            aria-label={`PIN digit ${i + 1}`}
          />
        ))}
      </div>
    )
  }

  return (
    <div className="relative">
      <input
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && onEnter) onEnter(value)
        }}
        placeholder="Enter password…"
        autoFocus={autoFocus}
        autoComplete="current-password"
        className={`w-full px-3 py-2 pr-10 rounded-lg border-2 bg-[var(--bg-surface)] text-sm text-[var(--text-primary)] placeholder-[#9E9E9E] focus:outline-none transition-colors ${
          error
            ? 'border-red-400 dark:border-red-500'
            : 'border-[var(--border)] focus:border-[#1976D2]'
        }`}
      />
      {onToggleShow && (
        <button
          type="button"
          onClick={onToggleShow}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9E9E9E] hover:text-[var(--text-secondary)]"
          aria-label={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  )
}
