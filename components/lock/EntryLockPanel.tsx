'use client'

import { useState } from 'react'
import { Lock, LockOpen, Hash, KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import LockPicker from '@/components/lock/LockPicker'
import SecretInput from '@/components/lock/SecretInput'
import { setLock, changeJournalEntryLock, verifyLock } from '@/lib/actions/lock'

export type LockType = 'none' | 'pin' | 'password'

interface EntryLockPanelProps {
  entryId: string
  journalId: string
  /** Whether THIS entry currently participates in the journal's shared lock. */
  entryLockType: LockType
  /** The journal's shared entry-lock config (applies to every locked entry). */
  journalEntryLockType: LockType
  onClose: () => void
  onApplied: (newEntryLockType: LockType, newJournalEntryLockType: LockType) => void
}

type Phase =
  // Landing view — shows current state + available actions
  | 'menu'
  // First lock ever in this journal → user picks type + secret
  | 'bootstrap'
  // Remove THIS entry's participation (shared secret stays for siblings)
  | 'remove-verify'
  // Change the journal-level shared secret — step 1 verify current
  | 'change-verify'
  // Change the journal-level shared secret — step 2 pick new
  | 'change-new'

function lockLabel(t: LockType): string {
  if (t === 'pin') return '4-digit PIN'
  if (t === 'password') return 'password'
  return 'none'
}

export default function EntryLockPanel({
  entryId,
  journalId,
  entryLockType,
  journalEntryLockType,
  onClose,
  onApplied,
}: EntryLockPanelProps) {
  // Work out the initial phase. No shared lock + no entry lock → straight to
  // bootstrap; everything else starts on the menu so the user can pick.
  const [phase, setPhase] = useState<Phase>(() =>
    journalEntryLockType === 'none' ? 'bootstrap' : 'menu',
  )
  const [busy, setBusy] = useState(false)

  // Bootstrap state (picking the very first journal-wide entry lock)
  const [newLockType, setNewLockType] = useState<LockType>('none')
  const [newSecret, setNewSecret] = useState('')

  // Verify-current state (used by remove + change flows)
  const [currentSecret, setCurrentSecret] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [currentError, setCurrentError] = useState<string | null>(null)
  // Bumped after a failed verify so SecretInput fully remounts — gives a
  // clean DOM for the PIN digits and re-triggers autoFocus on the first box.
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
    const res = await setLock(entryId, 'entry', newLockType, newSecret)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success('Entry locked')
    onApplied(newLockType, newLockType)
  }

  async function attachToSharedLock() {
    // Journal already has a shared lock; just opt this entry in. No secret
    // needed (it's already stored on the journal).
    setBusy(true)
    const res = await setLock(entryId, 'entry', journalEntryLockType)
    setBusy(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success('Entry locked')
    onApplied(journalEntryLockType, journalEntryLockType)
  }

  // `secretOverride` is the just-typed value from SecretInput's auto-submit —
  // it's needed because the `currentSecret` state hasn't flushed yet when
  // onEnter fires on the 4th PIN digit.
  async function applyRemove(secretOverride?: string) {
    const secret = secretOverride ?? currentSecret
    if (!secret || (journalEntryLockType === 'pin' && secret.length < 4)) {
      setCurrentError(
        journalEntryLockType === 'pin' ? 'Enter all 4 PIN digits' : 'Enter your password',
      )
      return
    }
    setBusy(true)
    setCurrentError(null)
    const res = await setLock(entryId, 'entry', 'none', undefined, secret)
    setBusy(false)
    if ('error' in res) {
      setCurrentError(res.error)
      setCurrentSecret('')
      setVerifyAttempt((v) => v + 1)
      return
    }
    toast.success('Lock removed from this entry')
    onApplied('none', journalEntryLockType)
  }

  async function verifyCurrentForChange(secretOverride?: string) {
    const secret = secretOverride ?? currentSecret
    if (!secret || (journalEntryLockType === 'pin' && secret.length < 4)) {
      setCurrentError(
        journalEntryLockType === 'pin' ? 'Enter all 4 PIN digits' : 'Enter your password',
      )
      return
    }
    setBusy(true)
    setCurrentError(null)
    const res = await verifyLock(entryId, 'entry', secret)
    setBusy(false)
    if ('error' in res) {
      setCurrentError(res.error)
      setCurrentSecret('')
      setVerifyAttempt((v) => v + 1)
      return
    }
    // Stash the verified secret so the change-new phase can pass it to
    // changeJournalEntryLock without re-prompting.
    if (secretOverride !== undefined) setCurrentSecret(secretOverride)
    setPhase('change-new')
  }

  async function applyChangeNew() {
    if (changeNewType === 'pin' && !/^\d{4}$/.test(changeNewSecret)) {
      toast.error('Please enter all 4 PIN digits')
      return
    }
    if (changeNewType === 'password' && changeNewSecret.length === 0) {
      toast.error('Please enter a password')
      return
    }
    setBusy(true)
    const res = await changeJournalEntryLock(
      journalId,
      changeNewType,
      currentSecret,
      changeNewType === 'none' ? undefined : changeNewSecret,
    )
    if ('error' in res) {
      setBusy(false)
      toast.error(res.error)
      return
    }

    // If the user invoked this flow from an unlocked entry and the new shared
    // lock is non-none, opt this entry in too — matches their intent to
    // "lock entries in this journal starting here".
    let nextEntryLock: LockType
    if (changeNewType === 'none') {
      nextEntryLock = 'none'
    } else if (entryLockType === 'none') {
      const attach = await setLock(entryId, 'entry', changeNewType)
      if ('error' in attach) {
        setBusy(false)
        toast.error(
          `Shared lock updated, but this entry couldn't be attached: ${attach.error}`,
        )
        onApplied('none', changeNewType)
        return
      }
      nextEntryLock = changeNewType
    } else {
      nextEntryLock = changeNewType
    }
    setBusy(false)

    toast.success(
      changeNewType === 'none'
        ? 'Journal entry lock removed'
        : entryLockType === 'none'
          ? 'Journal entry lock updated and this entry locked'
          : 'Journal entry lock updated for all locked entries',
    )
    onApplied(nextEntryLock, changeNewType)
  }

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  function renderMenu() {
    const isLocked = entryLockType !== 'none'
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--bg-muted)] border border-[var(--border)]">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[#1976D2]/10 text-[#1976D2]"
          >
            {journalEntryLockType === 'pin' ? <Hash size={14} /> : <KeyRound size={14} />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-[var(--text-primary)]">
              {isLocked
                ? `This entry is locked with the journal's ${lockLabel(journalEntryLockType)}.`
                : `This journal uses a shared ${lockLabel(journalEntryLockType)} for locked entries.`}
            </p>
            <p className="text-xs text-[var(--text-muted)]">
              Every locked entry in this journal shares the same secret.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {!isLocked ? (
            <button
              type="button"
              onClick={attachToSharedLock}
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-[#1976D2] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? 'Applying…' : `Lock this entry with the journal's ${lockLabel(journalEntryLockType)}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { setCurrentSecret(''); setCurrentError(null); setPhase('remove-verify') }}
              className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-[var(--bg-muted)] transition-colors"
            >
              Remove lock from this entry
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setCurrentSecret('')
              setCurrentError(null)
              setChangeNewType(journalEntryLockType)
              setChangeNewSecret('')
              setPhase('change-verify')
            }}
            className="w-full py-2.5 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
          >
            Change this journal&apos;s shared entry lock
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
          This is the first locked entry in this journal. Choose a PIN or password —
          every locked entry in this journal will share it.
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
            {busy ? 'Saving…' : 'Lock entry'}
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
    const inputType: 'pin' | 'password' = journalEntryLockType === 'pin' ? 'pin' : 'password'
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
          Choose the new shared entry lock. Every currently locked entry in this
          journal will switch to this new secret.
        </p>
        <LockPicker
          lockType={changeNewType}
          onChange={(t, s) => { setChangeNewType(t); setChangeNewSecret(s) }}
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
            disabled={busy}
            className="flex-[2] py-2 rounded-lg bg-[#1976D2] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {busy
              ? 'Saving…'
              : changeNewType === 'none'
                ? 'Remove journal entry lock'
                : 'Apply new lock'}
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
        {entryLockType !== 'none' ? <Lock size={11} /> : <LockOpen size={11} />}
        <ShieldCheck size={11} />
        Entry Security
      </p>

      {phase === 'menu' && renderMenu()}
      {phase === 'bootstrap' && renderBootstrap()}
      {phase === 'remove-verify' &&
        renderVerifyCurrent(
          `Enter the journal's ${lockLabel(journalEntryLockType)} to unlock this entry`,
          'Remove lock',
          applyRemove,
          true,
        )}
      {phase === 'change-verify' &&
        renderVerifyCurrent(
          `Enter the current journal ${lockLabel(journalEntryLockType)}`,
          'Continue',
          verifyCurrentForChange,
        )}
      {phase === 'change-new' && renderChangeNew()}
    </div>
  )
}
