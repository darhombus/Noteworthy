'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, ShieldCheck, ShieldOff, AlertTriangle, Check, ChevronDown, Clock } from 'lucide-react'
import { toast } from 'sonner'
import SecretInput, { type SecretInputHandle } from '@/components/lock/SecretInput'
import {
  removeVaultSecret,
  setVaultAutoLockMinutes,
  setVaultSecret,
} from '@/lib/actions/vault'
import ChangeVaultModal from './ChangeVaultModal'

type SecretType = 'pin' | 'password'

interface Props {
  /** Current vault secret type — null when no secret is set yet. */
  secretType: SecretType | null
  /** Current auto-lock window in minutes. Defaults to 5 server-side. */
  autoLockMinutes: number
}

const AUTO_LOCK_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: '1 minute' },
  { value: 5, label: '5 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 30, label: '30 minutes' },
]

export default function VaultSection({ secretType, autoLockMinutes }: Props) {
  return (
    <div className="rounded-xl border border-[#E0E0E0] dark:border-slate-700 bg-white dark:bg-[#1E1E1E] shadow-sm overflow-hidden">
      {secretType === null ? (
        <SetupCard />
      ) : (
        <ManageCard secretType={secretType} autoLockMinutes={autoLockMinutes} />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Case A — no vault secret yet
// ---------------------------------------------------------------------------

function SetupCard() {
  const router = useRouter()
  const [secretType, setSecretType] = useState<SecretType>('pin')
  const [secret, setSecret] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const confirmRef = useRef<SecretInputHandle>(null)

  function validate(): string | null {
    if (secretType === 'pin') {
      if (!/^\d{4}$/.test(secret)) return 'PIN must be exactly 4 digits'
    } else if (secret.length < 8) {
      return 'Password must be at least 8 characters'
    }
    if (secret !== confirm) return 'The two entries do not match'
    return null
  }

  function handleSubmit() {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    startTransition(async () => {
      const result = await setVaultSecret(secretType, secret)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success('Hidden Vault enabled')
      router.refresh()
    })
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1976D2]/10 dark:bg-[#1E3A5F] flex items-center justify-center shrink-0">
          <ShieldCheck size={20} className="text-[#1976D2]" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-[#212121] dark:text-[#F5F5F5]">Hidden Vault</h2>
          <p className="text-sm text-[#757575] dark:text-[#9E9E9E] mt-1">
            Set a PIN or password to enable Hidden. Hidden journals and entries
            won&apos;t appear anywhere except under the Hidden tab, which is
            locked behind this credential.
          </p>
        </div>
      </div>

      <div className="inline-flex p-0.5 bg-[var(--bg-muted)] border border-[#E0E0E0] dark:border-slate-700 rounded-lg">
        {(['pin', 'password'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setSecretType(t)
              setSecret('')
              setConfirm('')
              setError(null)
            }}
            className={`px-3 py-1 text-xs font-semibold rounded-[6px] transition-colors ${
              secretType === t
                ? 'bg-white dark:bg-[#1E1E1E] text-[#1976D2] shadow-sm border border-[#E0E0E0] dark:border-slate-700'
                : 'text-[#757575] dark:text-[#9E9E9E]'
            }`}
          >
            {t === 'pin' ? '4-digit PIN' : 'Password'}
          </button>
        ))}
      </div>

      <Field label={secretType === 'pin' ? 'New PIN' : 'New password'}>
        <SecretInput
          lockType={secretType}
          value={secret}
          onChange={(v) => { setSecret(v); setError(null) }}
          showPassword={showSecret}
          onToggleShow={secretType === 'password' ? () => setShowSecret((v) => !v) : undefined}
          placeholder={secretType === 'password' ? 'New password' : undefined}
          autoSubmitOnFull={false}
          onEnter={() => confirmRef.current?.focus()}
        />
      </Field>

      <Field label={`Confirm ${secretType === 'pin' ? 'PIN' : 'password'}`}>
        <SecretInput
          ref={confirmRef}
          lockType={secretType}
          value={confirm}
          onChange={(v) => { setConfirm(v); setError(null) }}
          showPassword={showConfirm}
          onToggleShow={secretType === 'password' ? () => setShowConfirm((v) => !v) : undefined}
          placeholder={secretType === 'password' ? 'Confirm password' : undefined}
          autoSubmitOnFull={false}
          onEnter={() => handleSubmit()}
        />
      </Field>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      <div className="flex justify-end pt-1">
        <button
          onClick={handleSubmit}
          disabled={pending || !secret || !confirm}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#1976D2] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          <Lock size={14} />
          {pending ? 'Enabling…' : 'Enable Hidden Vault'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Case B — vault secret exists
// ---------------------------------------------------------------------------

function ManageCard({
  secretType,
  autoLockMinutes,
}: {
  secretType: SecretType
  autoLockMinutes: number
}) {
  const [showChange, setShowChange] = useState(false)
  const [showDanger, setShowDanger] = useState(false)
  const [autoLock, setAutoLock] = useState<number>(autoLockMinutes)
  const [autoLockPending, startAutoLockTransition] = useTransition()

  function handleAutoLockChange(minutes: number) {
    const previous = autoLock
    setAutoLock(minutes)
    startAutoLockTransition(async () => {
      const result = await setVaultAutoLockMinutes(minutes)
      if ('error' in result) {
        setAutoLock(previous)
        toast.error(result.error)
        return
      }
      toast.success('Auto-lock updated')
    })
  }

  return (
    <>
      <div className="p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1976D2]/10 dark:bg-[#1E3A5F] flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-[#1976D2]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-semibold text-[#212121] dark:text-[#F5F5F5]">Hidden Vault</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide bg-[#1976D2]/10 text-[#1976D2] dark:bg-[#1E3A5F] dark:text-[#64B5F6] border border-[#1976D2]/20 dark:border-[#1E3A5F]">
                {secretType === 'pin' ? 'PIN' : 'Password'}
              </span>
            </div>
            <p className="text-sm text-[#757575] dark:text-[#9E9E9E] mt-1">
              Hidden journals and entries are gated behind your {secretType === 'pin' ? 'PIN' : 'password'}.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setShowChange(true)}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E0E0E0] dark:border-slate-700 text-[#212121] dark:text-[#F5F5F5] hover:bg-[#F5F5F5] dark:hover:bg-[#2C2C2C] transition-colors"
          >
            Change credential
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-[#757575] dark:text-[#9E9E9E]">
            Auto-lock after
          </label>
          <AutoLockSelect
            value={autoLock}
            disabled={autoLockPending}
            onChange={handleAutoLockChange}
          />
          <p className="text-xs text-[#9E9E9E]">
            The vault re-locks automatically after this much inactivity, and any
            time you navigate away from /hidden.
          </p>
        </div>
      </div>

      {/* Danger zone */}
      <div className="border-t border-red-200 dark:border-red-900/40 bg-red-50/40 dark:bg-red-950/20 p-6 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-red-600 dark:text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Disable Hidden Vault</h3>
            <p className="text-sm text-[#757575] dark:text-[#9E9E9E] mt-1">
              This will unhide all your journals and entries and remove your
              vault credential. They will reappear in your normal journal list.
              This cannot be undone.
            </p>
          </div>
        </div>

        {!showDanger ? (
          <div className="flex justify-end">
            <button
              onClick={() => setShowDanger(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-red-300 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <ShieldOff size={14} />
              Disable Hidden Vault
            </button>
          </div>
        ) : (
          <DisablePanel
            secretType={secretType}
            onCancel={() => setShowDanger(false)}
          />
        )}
      </div>

      {showChange && (
        <ChangeVaultModal
          currentSecretType={secretType}
          onClose={() => setShowChange(false)}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Auto-lock dropdown — custom listbox so we can theme it (native <select>
// can't have its option list styled cross-browser)
// ---------------------------------------------------------------------------

function AutoLockSelect({
  value,
  disabled,
  onChange,
}: {
  value: number
  disabled: boolean
  onChange: (minutes: number) => void
}) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [activeIndex, setActiveIndex] = useState<number>(() => {
    const i = AUTO_LOCK_OPTIONS.findIndex((o) => o.value === value)
    return i === -1 ? 0 : i
  })

  const selected =
    AUTO_LOCK_OPTIONS.find((o) => o.value === value) ?? AUTO_LOCK_OPTIONS[1]

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function commit(minutes: number) {
    setOpen(false)
    buttonRef.current?.focus()
    if (minutes !== value) onChange(minutes)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        setOpen(true)
      }
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      buttonRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, AUTO_LOCK_OPTIONS.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActiveIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActiveIndex(AUTO_LOCK_OPTIONS.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const opt = AUTO_LOCK_OPTIONS[activeIndex]
      if (opt) commit(opt.value)
    }
  }

  return (
    <div
      ref={wrapperRef}
      className="relative w-full max-w-[220px]"
      onKeyDown={handleKeyDown}
    >
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return
          setActiveIndex(
            Math.max(0, AUTO_LOCK_OPTIONS.findIndex((o) => o.value === value)),
          )
          setOpen((v) => !v)
        }}
        className={`flex items-center justify-between w-full gap-2 px-3 py-2 text-sm rounded-lg border bg-white dark:bg-[#1E1E1E] text-[#212121] dark:text-[#F5F5F5] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1976D2] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-[#1E1E1E] disabled:opacity-50 disabled:cursor-not-allowed ${
          open
            ? 'border-[#1976D2] dark:border-[#1976D2] ring-1 ring-[#1976D2]'
            : 'border-[#E0E0E0] dark:border-slate-700 hover:border-[#9E9E9E] dark:hover:border-slate-500'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Clock size={14} className="text-[#1976D2] shrink-0" />
          <span className="truncate font-medium">{selected.label}</span>
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-[#9E9E9E] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Auto-lock duration"
          tabIndex={-1}
          className="absolute z-30 mt-1.5 w-full rounded-lg border border-[#E0E0E0] dark:border-slate-700 bg-white dark:bg-[#1E1E1E] shadow-lg overflow-hidden py-1"
        >
          {AUTO_LOCK_OPTIONS.map((opt, i) => {
            const isSelected = opt.value === value
            const isActive = i === activeIndex
            return (
              <li key={opt.value} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onClick={() => commit(opt.value)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={`flex items-center justify-between w-full gap-3 px-3 py-2 text-sm text-left transition-colors ${
                    isActive
                      ? 'bg-[#1976D2]/10 dark:bg-[#1E3A5F] text-[#1976D2] dark:text-[#64B5F6]'
                      : 'text-[#212121] dark:text-[#F5F5F5] hover:bg-[var(--bg-muted)]'
                  } ${isSelected ? 'font-semibold' : 'font-normal'}`}
                >
                  <span>{opt.label}</span>
                  {isSelected && (
                    <Check size={14} className="shrink-0 text-[#1976D2] dark:text-[#64B5F6]" />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Disable confirmation panel — DISABLE word + current credential
// ---------------------------------------------------------------------------

function DisablePanel({
  secretType,
  onCancel,
}: {
  secretType: SecretType
  onCancel: () => void
}) {
  const router = useRouter()
  const [confirmation, setConfirmation] = useState('')
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const ready = confirmation === 'DISABLE' && secret.length > 0

  function handleConfirm() {
    if (!ready) return
    startTransition(async () => {
      const result = await removeVaultSecret(secret)
      if ('error' in result) {
        setError(result.error)
        setSecret('')
        return
      }
      const j = result.journalsRestored
      const e = result.entriesRestored
      toast.success(
        `Vault disabled. ${j} journal${j === 1 ? '' : 's'} and ${e} entr${e === 1 ? 'y' : 'ies'} restored.`,
      )
      router.push('/journals')
    })
  }

  return (
    <div className="space-y-3 pt-1">
      <Field label="Type DISABLE to confirm">
        <input
          type="text"
          value={confirmation}
          onChange={(e) => { setConfirmation(e.target.value); setError(null) }}
          placeholder="DISABLE"
          className="w-full px-3 py-2 rounded-lg border border-[#E0E0E0] dark:border-slate-700 bg-white dark:bg-[#1E1E1E] text-sm text-[#212121] dark:text-[#F5F5F5] placeholder-[#9E9E9E] focus:outline-none focus:ring-1 focus:ring-red-500"
        />
      </Field>

      <Field label={`Current ${secretType === 'pin' ? 'PIN' : 'password'}`}>
        <SecretInput
          lockType={secretType}
          value={secret}
          onChange={(v) => { setSecret(v); setError(null) }}
          showPassword={showSecret}
          onToggleShow={secretType === 'password' ? () => setShowSecret((v) => !v) : undefined}
          placeholder={secretType === 'password' ? 'Current password' : undefined}
          autoSubmitOnFull={false}
          onEnter={() => { if (ready) handleConfirm() }}
        />
      </Field>

      {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button
          onClick={onCancel}
          disabled={pending}
          className="px-3 py-1.5 text-sm rounded-lg text-[#757575] dark:text-[#9E9E9E] hover:bg-[var(--bg-muted)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleConfirm}
          disabled={!ready || pending}
          className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ShieldOff size={14} />
          {pending ? 'Disabling…' : 'Disable Hidden Vault'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[#757575] dark:text-[#9E9E9E] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}
