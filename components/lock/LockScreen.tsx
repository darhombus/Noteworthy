'use client'

import { useState, useRef } from 'react'
import { Lock, Eye, EyeOff, BookOpen, FileText } from 'lucide-react'
import { verifyLock } from '@/lib/actions/lock'

interface LockScreenProps {
  lockType: 'pin' | 'password'
  entityId: string
  entityType: 'journal' | 'entry'
  entityName?: string
  onUnlock: () => void
}

export default function LockScreen({
  lockType,
  entityId,
  entityType,
  entityName,
  onUnlock,
}: LockScreenProps) {
  const [pinDigits, setPinDigits] = useState<[string, string, string, string]>(['', '', '', ''])
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [shake, setShake] = useState(false)
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  function handlePinDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...pinDigits] as [string, string, string, string]
    next[index] = digit
    setPinDigits(next)
    setError(null)
    if (digit && index < 3) {
      pinRefs[index + 1].current?.focus()
    }
    // Auto-submit when all 4 digits are filled
    if (digit && index === 3) {
      const full = [...next].join('')
      if (full.length === 4) handleVerify(full)
    }
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      const next = [...pinDigits] as [string, string, string, string]
      next[index - 1] = ''
      setPinDigits(next)
      pinRefs[index - 1].current?.focus()
    }
  }

  async function handleVerify(secret?: string) {
    const toVerify = secret ?? (lockType === 'pin' ? pinDigits.join('') : password)
    if (!toVerify || (lockType === 'pin' && toVerify.length < 4)) return

    setIsVerifying(true)
    setError(null)

    const result = await verifyLock(entityId, entityType, toVerify)

    setIsVerifying(false)

    if ('error' in result) {
      setError(result.error)
      triggerShake()
      if (lockType === 'pin') setPinDigits(['', '', '', ''])
      setTimeout(() => pinRefs[0].current?.focus(), 50)
    } else {
      onUnlock()
    }
  }

  const Icon = entityType === 'journal' ? BookOpen : FileText

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="w-full max-w-[360px] flex flex-col items-center gap-6">
        {/* Icon cluster */}
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-[#1976D2]/10 dark:bg-[#1E3A5F] flex items-center justify-center">
            <Icon size={28} className="text-[#1976D2]" />
          </div>
          <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[var(--bg-surface)] border-2 border-[var(--border)] flex items-center justify-center">
            <Lock size={13} className="text-[var(--text-secondary)]" />
          </div>
        </div>

        {/* Copy */}
        <div className="text-center">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">
            {entityName ? `"${entityName}" is locked` : `This ${entityType} is locked`}
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {lockType === 'pin'
              ? 'Enter your 4-digit PIN to continue'
              : 'Enter your password to continue'}
          </p>
        </div>

        {/* Input */}
        <div className={`w-full transition-transform ${shake ? 'animate-[shake_0.4s_ease]' : ''}`}>
          {lockType === 'pin' ? (
            <div className="flex items-center justify-center gap-3">
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
                  autoFocus={i === 0}
                  className={`w-14 h-14 text-center text-2xl font-bold rounded-xl border-2 bg-[var(--bg-muted)] text-[var(--text-primary)] focus:outline-none transition-colors ${
                    error
                      ? 'border-red-400 dark:border-red-500'
                      : 'border-[var(--border)] focus:border-[#1976D2]'
                  }`}
                  placeholder="·"
                  aria-label={`PIN digit ${i + 1}`}
                />
              ))}
            </div>
          ) : (
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null) }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerify() }}
                placeholder="Enter password…"
                autoFocus
                autoComplete="current-password"
                className={`w-full px-4 py-3 pr-11 rounded-xl border-2 bg-[var(--bg-muted)] text-sm text-[var(--text-primary)] placeholder-[#9E9E9E] focus:outline-none transition-colors ${
                  error
                    ? 'border-red-400 dark:border-red-500'
                    : 'border-[var(--border)] focus:border-[#1976D2]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9E9E9E] hover:text-[var(--text-secondary)]"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 text-center mt-2">{error}</p>
          )}
        </div>

        {/* Unlock button (password mode only — PIN auto-submits) */}
        {lockType === 'password' && (
          <button
            onClick={() => handleVerify()}
            disabled={isVerifying || !password}
            className="w-full py-3 rounded-xl bg-[#1976D2] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifying ? 'Verifying…' : 'Unlock'}
          </button>
        )}

        {isVerifying && lockType === 'pin' && (
          <p className="text-xs text-[var(--text-muted)]">Verifying…</p>
        )}
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-5px); }
          80%      { transform: translateX(5px); }
        }
      `}</style>
    </div>
  )
}
