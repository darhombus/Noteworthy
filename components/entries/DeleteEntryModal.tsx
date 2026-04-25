'use client'

import { useState, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { AlertTriangle, Lock, Eye, EyeOff, X } from 'lucide-react'
import { isHiddenPathname, journalListHref } from '@/lib/utils/entryRoute'
import { toast } from 'sonner'
import { softDeleteEntry } from '@/lib/actions/entries'
import { verifyLock } from '@/lib/actions/lock'

interface DeleteEntryModalProps {
  entryId: string
  journalId: string
  lockType: 'none' | 'pin' | 'password'
  onClose: () => void
}

export default function DeleteEntryModal({ entryId, journalId, lockType, onClose }: DeleteEntryModalProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [isDeleting, setIsDeleting] = useState(false)
  const [pinDigits, setPinDigits] = useState<[string, string, string, string]>(['', '', '', ''])
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)
  const pinRefs = [
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
    useRef<HTMLInputElement>(null),
  ]

  function handlePinDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, '').slice(-1)
    const next = [...pinDigits] as [string, string, string, string]
    next[index] = digit
    setPinDigits(next)
    setLockError(null)
    if (digit && index < 3) pinRefs[index + 1].current?.focus()
  }

  function handlePinKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !pinDigits[index] && index > 0) {
      const next = [...pinDigits] as [string, string, string, string]
      next[index - 1] = ''
      setPinDigits(next)
      pinRefs[index - 1].current?.focus()
    }
  }

  async function handleDelete() {
    setIsDeleting(true)
    setLockError(null)

    if (lockType !== 'none') {
      const secret = lockType === 'pin' ? pinDigits.join('') : password
      if (!secret || (lockType === 'pin' && secret.length < 4)) {
        setLockError(lockType === 'pin' ? 'Enter your 4-digit PIN' : 'Enter your password')
        setIsDeleting(false)
        return
      }
      const verification = await verifyLock(entryId, 'entry', secret)
      if ('error' in verification) {
        setLockError(verification.error)
        // Clear whichever field was used so the retry starts empty.
        if (lockType === 'pin') {
          setPinDigits(['', '', '', ''])
          setTimeout(() => pinRefs[0].current?.focus(), 0)
        } else {
          setPassword('')
        }
        setIsDeleting(false)
        return
      }
    }

    const result = await softDeleteEntry(entryId, journalId)
    if ('error' in result) {
      toast.error(result.error)
      setIsDeleting(false)
      return
    }
    onClose()
    toast.success('Entry moved to recycle bin')
    // Stay in the hidden context when deleting from /hidden/**. For the
    // standalone hidden-entry editor (/hidden/entries/<eid>) there's no
    // parent-journal list on the hidden side, so fall back to /hidden.
    if (isHiddenPathname(pathname)) {
      if (pathname.startsWith('/hidden/journals/')) {
        router.push(journalListHref(pathname, journalId))
      } else {
        router.push('/hidden')
      }
      return
    }
    router.push(`/journals/${journalId}`)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-xl w-full max-w-sm border border-[var(--border)]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-gray-900 dark:text-white">Delete Entry</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-600 dark:text-slate-300">
              This entry will be moved to the recycle bin and can be restored later.
            </p>
          </div>

          {lockType !== 'none' && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-muted)] p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                <Lock size={14} className="text-[var(--text-secondary)]" />
                {lockType === 'pin' ? 'Enter PIN to confirm' : 'Enter password to confirm'}
              </div>

              {lockType === 'pin' ? (
                <div className="flex gap-2">
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
                      className={`w-11 h-11 text-center text-lg font-bold rounded-lg border-2 bg-[var(--bg-surface)] text-[var(--text-primary)] focus:outline-none transition-colors ${
                        lockError ? 'border-red-400 dark:border-red-500' : 'border-[var(--border)] focus:border-[#1976D2]'
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
                    onChange={(e) => { setPassword(e.target.value); setLockError(null) }}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleDelete() }}
                    placeholder="Enter password…"
                    autoFocus
                    autoComplete="current-password"
                    className={`w-full px-3 py-2 pr-10 rounded-lg border-2 bg-[var(--bg-surface)] text-sm text-[var(--text-primary)] placeholder-[#9E9E9E] focus:outline-none transition-colors ${
                      lockError ? 'border-red-400 dark:border-red-500' : 'border-[var(--border)] focus:border-[#1976D2]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9E9E9E] hover:text-[var(--text-secondary)]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              )}

              {lockError && (
                <p className="text-xs text-red-500 dark:text-red-400">{lockError}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 pb-5">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Verifying…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}
