'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Lock, Eye, EyeOff, X } from 'lucide-react'
import { toast } from 'sonner'
import { deleteJournal } from '@/lib/actions/journals'
import { verifyLock } from '@/lib/actions/lock'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']

interface DeleteJournalModalProps {
  journal: Journal
  onClose: () => void
  onSuccess: () => void
}

export default function DeleteJournalModal({ journal, onClose, onSuccess }: DeleteJournalModalProps) {
  const router = useRouter()
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

  const lockType = journal.lock_type as 'none' | 'pin' | 'password'

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
      const verification = await verifyLock(journal.journal_id, 'journal', secret)
      if ('error' in verification) {
        setLockError(verification.error)
        if (lockType === 'pin') setPinDigits(['', '', '', ''])
        setIsDeleting(false)
        return
      }
    }

    const result = await deleteJournal(journal.journal_id)
    if ('error' in result) {
      toast.error(result.error)
      setIsDeleting(false)
      return
    }
    onSuccess()
    toast.success('Journal moved to recycle bin')
    router.refresh()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[var(--bg-surface)] rounded-xl shadow-xl w-full max-w-sm border border-[var(--border)]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
          <h2 className="font-semibold text-gray-900 dark:text-white">Delete Journal</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm text-gray-600 dark:text-slate-300">
                This will move{' '}
                <span className="font-medium text-gray-900 dark:text-white">
                  {journal.entry_count} {journal.entry_count === 1 ? 'entry' : 'entries'}
                </span>{' '}
                to the recycle bin.
              </p>
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Are you sure you want to delete{' '}
                <span className="font-medium text-gray-700 dark:text-slate-200">
                  &ldquo;{journal.title}&rdquo;
                </span>
                ?
              </p>
            </div>
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

        {/* Actions */}
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
