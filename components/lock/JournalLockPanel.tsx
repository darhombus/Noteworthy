'use client'

import { useState } from 'react'
import { Lock, LockOpen, Hash, KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import LockPicker from '@/components/lock/LockPicker'
import SecretInput from '@/components/lock/SecretInput'
import { setLock, verifyLock } from '@/lib/actions/lock'

export type LockType = 'none' | 'pin' | 'password'

interface JournalLockPanelProps {
  journalId: string
  /** The journal's current lock config. */
  journalLockType: LockType
  onClose: () => void
  /** Fired after a successful add / change / remove with the new lock type. */
  onApplied: (newLockType: LockType) => void
}

type Phase =
  // Landing view — shows current state + available actions
  | 'menu'
  // First journal lock → pick type + secret
  | 'bootstrap'
  // Remove the journal lock → verify current secret
  | 'remove-verify'
  // Change the journal lock — step 1 verify current
  | 'change-verify'
  // Change the journal lock — step 2 pick new type + secret
  | 'change-new'

function lockLabel(t: LockType): string {
  if (t === 'pin') return '4-digit PIN'
  if (t === 'password') return 'password'
  return 'none'
}

export default function JournalLockPanel({
  journalId,
  journalLockType,
  onClose,
  onApplied,
}: JournalLockPanelProps) {
  // Unlocked journal → straight to bootstrap; locked journal → menu.
  const [phase, setPhase] = useState<Phase>(() =>
    journalLockType === 'none' ? 'bootstrap' : 'menu',
  )
  const [busy, setBusy] = useState(false)

  // Bootstrap state
  const [newLockType, setNewLockType] = useState<LockType>('none')
  const [newSecret, setNewSecret] = useState('')

  // Verify-current state (remove + change)
  const [currentSecret, setCurrentSecret] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [currentError, setCurrentError] = useState<string | null>(null)
  // Bumped after a failed verify so SecretInput fully remounts — clears the
  // PIN digits and re-fires autoFocus on the first box.
  const [verifyAttempt, setVerifyAttempt] = useState(0)

  // Change-new state
  const [changeNewType, setChangeNewType] = useState<LockType>('none')
  const [changeNewSecret, setChangeNewSecret] = useState('')

  // ------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------

  async function applyBootstrap() {
    if (newLockType === 'none') {
      toast.error('Pick a PIN or password first')
      return
    }
    if (newLockType === 'pin' && !/^\d{4}$/.test(newSecret)) {
      toast.error('Please enter all 4 PIN digits')
      return
    }
    if (newLockType === 'password' && newSecret.length === 0) {
      toast.error('Please enter a password')
      return
    }
    setBusy(true)
    const res = await setLock(journalId, 'journal', newLockType, newSecret)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success('Journal locked')
    onApplied(newLockType)
  }

  // `secretOverride` is the just-typed value from SecretInput's auto-submit —
  // needed because the `currentSecret` state hasn't flushed yet when onEnter
  // fires on the 4th PIN digit.
  async function applyRemove(secretOverride?: string) {
    const secret = secretOverride ?? currentSecret
    if (!secret || (journalLockType === 'pin' && secret.length < 4)) {
      setCurrentError(
        journalLockType === 'pin' ? 'Enter all 4 PIN digits' : 'Enter your password',
      )
      return
    }
    setBusy(true)
    setCurrentError(null)
    const res = await setLock(journalId, 'journal', 'none', undefined, secret)
    setBusy(false)
    if ('error' in res) {
      setCurrentError(res.error)
      setCurrentSecret('')
      setVerifyAttempt((v) => v + 1)
      return
    }
    toast.success('Lock removed')
    onApplied('none')
  }

  async function verifyCurrentForChange(secretOverride?: string) {
    const secret = secretOverride ?? currentSecret
    if (!secret || (journalLockType === 'pin' && secret.length < 4)) {
      setCurrentError(
        journalLockType === 'pin' ? 'Enter all 4 PIN digits' : 'Enter your password',
      )
      return
    }
    setBusy(true)
    setCurrentError(null)
    const res = await verifyLock(journalId, 'journal', secret)
    setBusy(false)
    if ('error' in res) {
      setCurrentError(res.error)
      setCurrentSecret('')
      setVerifyAttempt((v) => v + 1)
      return
    }
    // Stash the verified secret so change-new can pass it to setLock without
    // re-prompting the user.
    if (secretOverride !== undefined) setCurrentSecret(secretOverride)
    setPhase('change-new')
  }

  async function applyChangeNew() {
    if (changeNewType === 'none') {
      toast.error('Pick a PIN or password, or use "Remove lock" instead')
      return
    }
    if (changeNewType === 'pin' && !/^\d{4}$/.test(changeNewSecret)) {
      toast.error('Please enter all 4 PIN digits')
      return
    }
    if (changeNewType === 'password' && changeNewSecret.length === 0) {
      toast.error('Please enter a password')
      return
    }
    setBusy(true)
    const res = await setLock(
      journalId,
      'journal',
      changeNewType,
      changeNewSecret,
      currentSecret,
    )
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success('Journal lock updated')
    onApplied(changeNewType)
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  function renderMenu() {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-muted)] border border-[var(--border)]">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#1976D2]/10 text-[#1976D2]">
            {journalLockType === 'pin' ? <Hash size={14} /> : <KeyRound size={14} />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              This journal is locked with a {lockLabel(journalLockType)}.
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              You will need this secret every time you open the journal.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setCurrentSecret('')
              setCurrentError(null)
              setChangeNewType(journalLockType)
              setChangeNewSecret('')
              setPhase('change-verify')
            }}
            className="w-full py-2.5 rounded-lg bg-[#1976D2] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Change this journal&apos;s lock
          </button>
          <button
            type="button"
            onClick={() => {
              setCurrentSecret('')
              setCurrentError(null)
              setPhase('remove-verify')
            }}
            className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-[var(--bg-muted)] transition-colors"
          >
            Remove lock from this journal
          </button>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="w-full text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          Cancel
        </button>
      </div>
    )
  }

  function renderBootstrap() {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Choose a PIN or password — you&apos;ll need it every time you open this journal.
        </p>
        <LockPicker
          lockType={newLockType}
          onChange={(t, s) => { setNewLockType(t); setNewSecret(s) }}
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={applyBootstrap}
            disabled={busy || newLockType === 'none'}
            className="flex-[2] py-2 rounded-lg bg-[#1976D2] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Lock journal'}
          </button>
        </div>
      </div>
    )
  }

  function renderVerifyCurrent(
    title: string,
    ctaLabel: string,
    onSubmit: (value?: string) => void,
    destructive = false,
  ) {
    const inputType: 'pin' | 'password' = journalLockType === 'pin' ? 'pin' : 'password'
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-[var(--text-primary)] flex items-center gap-2">
          <Lock size={14} className="text-[var(--text-secondary)]" />
          {title}
        </p>
        <SecretInput
          key={verifyAttempt}
          lockType={inputType}
          value={currentSecret}
          onChange={(v) => { setCurrentSecret(v); setCurrentError(null) }}
          error={!!currentError}
          autoFocus
          showPassword={showCurrent}
          onToggleShow={() => setShowCurrent((v) => !v)}
          onEnter={onSubmit}
        />
        {currentError && (
          <p className="text-xs text-red-500 dark:text-red-400">{currentError}</p>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPhase('menu')}
            className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => onSubmit()}
            disabled={busy}
            className={`flex-[2] py-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 text-white ${
              destructive ? 'bg-red-600' : 'bg-[#1976D2]'
            }`}
          >
            {busy ? 'Verifying…' : ctaLabel}
          </button>
        </div>
      </div>
    )
  }

  function renderChangeNew() {
    return (
      <div className="space-y-3">
        <p className="text-xs text-[var(--text-muted)]">
          Choose the new lock. Switching between PIN and password is fine — the
          old secret is replaced.
        </p>
        <LockPicker
          lockType={changeNewType}
          onChange={(t, s) => { setChangeNewType(t); setChangeNewSecret(s) }}
          hint="This will replace the current lock."
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPhase('change-verify')}
            className="flex-1 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            Back
          </button>
          <button
            type="button"
            onClick={applyChangeNew}
            disabled={busy || changeNewType === 'none'}
            className="flex-[2] py-2 rounded-lg bg-[#1976D2] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Apply new lock'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-[var(--bg-surface)] border border-[var(--border-strong)] rounded-lg px-4 py-4">
      <p
        className="text-xs font-semibold text-[var(--text-muted)] uppercase mb-3 flex items-center gap-1.5"
        style={{ letterSpacing: '0.5px' }}
      >
        {journalLockType !== 'none' ? <Lock size={11} /> : <LockOpen size={11} />}
        <ShieldCheck size={11} />
        Journal Security
      </p>

      {phase === 'menu' && renderMenu()}
      {phase === 'bootstrap' && renderBootstrap()}
      {phase === 'remove-verify' &&
        renderVerifyCurrent(
          `Enter the journal's ${lockLabel(journalLockType)} to remove the lock`,
          'Remove lock',
          applyRemove,
          true,
        )}
      {phase === 'change-verify' &&
        renderVerifyCurrent(
          `Enter the current ${lockLabel(journalLockType)}`,
          'Continue',
          verifyCurrentForChange,
        )}
      {phase === 'change-new' && renderChangeNew()}
    </div>
  )
}
