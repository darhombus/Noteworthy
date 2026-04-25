'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, ShieldCheck, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import SecretInput, { type SecretInputHandle } from '@/components/lock/SecretInput'
import {
  setPrivacyPin,
  changePrivacyPin,
} from '@/lib/actions/privacy'

interface Props {
  /** Current Privacy PIN type — 'none' if not set. */
  pinType: 'none' | 'pin' | 'password'
}

type Mode = 'idle' | 'set' | 'change' | 'remove'

export default function PrivacyPinSection({ pinType }: Props) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('idle')
  const hasPin = pinType !== 'none'

  return (
    <div className="rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#1976D2]/10 dark:bg-[#1E3A5F] flex items-center justify-center shrink-0">
          {hasPin ? (
            <ShieldCheck size={18} className="text-[#1976D2]" />
          ) : (
            <Shield size={18} className="text-[#1976D2]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-[#212121] dark:text-[#F5F5F5]">
            Private Vault
          </h2>
          <p className="text-sm text-[#757575] dark:text-[#9E9E9E] mt-0.5">
            Hide journals and entries behind a PIN or password. Hidden items
            disappear from the main app and only show under the{' '}
            <span className="font-medium">Hidden</span> section after you
            unlock the vault.
          </p>
          {hasPin && (
            <p className="text-xs text-[#1976D2] dark:text-[#64B5F6] mt-1.5">
              Enabled — using {pinType === 'pin' ? 'a 4-digit PIN' : 'a password'}.
            </p>
          )}
        </div>
      </div>

      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {!hasPin && (
            <button
              onClick={() => setMode('set')}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#1976D2] text-white hover:opacity-90 transition-opacity"
            >
              Set up Private Vault
            </button>
          )}
          {hasPin && (
            <>
              <button
                onClick={() => setMode('change')}
                className="px-4 py-2 text-sm font-medium rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] text-[#212121] dark:text-[#F5F5F5] hover:bg-[#F5F5F5] dark:hover:bg-[#2C2C2C] transition-colors"
              >
                {pinType === 'pin' ? 'Change PIN' : 'Change password'}
              </button>
              <button
                onClick={() => setMode('remove')}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
              >
                <ShieldOff size={14} />
                {pinType === 'pin' ? 'Remove PIN' : 'Remove password'}
              </button>
            </>
          )}
        </div>
      )}

      {mode === 'set' && (
        <SetPinForm
          onCancel={() => setMode('idle')}
          onDone={() => {
            setMode('idle')
            router.refresh()
          }}
        />
      )}

      {mode === 'change' && (
        <ChangePinForm
          currentType={pinType as 'pin' | 'password'}
          onCancel={() => setMode('idle')}
          onDone={() => {
            setMode('idle')
            router.refresh()
          }}
        />
      )}

      {mode === 'remove' && (
        <RemovePinForm
          currentType={pinType as 'pin' | 'password'}
          onCancel={() => setMode('idle')}
          onDone={() => {
            setMode('idle')
            router.refresh()
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Set
// ---------------------------------------------------------------------------

function SetPinForm({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [pinType, setPinType] = useState<'pin' | 'password'>('pin')
  const [secret, setSecret] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const confirmRef = useRef<SecretInputHandle>(null)

  function validate(): string | null {
    if (pinType === 'pin') {
      if (!/^\d{4}$/.test(secret)) return 'PIN must be exactly 4 digits'
    } else if (secret.length < 4) {
      return 'Password must be at least 4 characters'
    }
    if (secret !== confirm) return 'The two entries do not match'
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    const result = await setPrivacyPin(pinType, secret)
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    toast.success('Privacy PIN set')
    onDone()
  }

  return (
    <div className="space-y-3 pt-2 border-t border-[#E0E0E0] dark:border-[#3A3A3A]">
      <TypeToggle value={pinType} onChange={(t) => { setPinType(t); setSecret(''); setConfirm(''); setError(null) }} />

      <Field label={pinType === 'pin' ? 'New PIN' : 'New password'}>
        <SecretInput
          lockType={pinType}
          value={secret}
          onChange={(v) => { setSecret(v); setError(null) }}
          autoFocus
          showPassword={showSecret}
          onToggleShow={pinType === 'password' ? () => setShowSecret((v) => !v) : undefined}
          placeholder={pinType === 'password' ? 'New password' : undefined}
          autoSubmitOnFull={false}
          onEnter={() => confirmRef.current?.focus()}
        />
      </Field>
      <Field label={`Confirm ${pinType === 'pin' ? 'PIN' : 'password'}`}>
        <SecretInput
          ref={confirmRef}
          lockType={pinType}
          value={confirm}
          onChange={(v) => { setConfirm(v); setError(null) }}
          showPassword={showConfirm}
          onToggleShow={pinType === 'password' ? () => setShowConfirm((v) => !v) : undefined}
          placeholder={pinType === 'password' ? 'Confirm password' : undefined}
          autoSubmitOnFull={false}
          onEnter={() => handleSave()}
        />
      </Field>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      <ActionRow>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !secret || !confirm}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-[#1976D2] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving…' : pinType === 'pin' ? 'Save PIN' : 'Save password'}
        </button>
      </ActionRow>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Change
// ---------------------------------------------------------------------------

function ChangePinForm({
  currentType,
  onCancel,
  onDone,
}: {
  currentType: 'pin' | 'password'
  onCancel: () => void
  onDone: () => void
}) {
  const [current, setCurrent] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [newType, setNewType] = useState<'pin' | 'password'>(currentType)
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const nextRef = useRef<SecretInputHandle>(null)
  const confirmRef = useRef<SecretInputHandle>(null)

  function validate(): string | null {
    if (!current) return 'Enter your current PIN or password'
    if (newType === 'pin') {
      if (!/^\d{4}$/.test(next)) return 'New PIN must be exactly 4 digits'
    } else if (next.length < 4) {
      return 'New password must be at least 4 characters'
    }
    if (next !== confirm) return 'The two new entries do not match'
    return null
  }

  async function handleSave() {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    setSaving(true)
    const result = await changePrivacyPin(current, newType, next)
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    toast.success('Privacy PIN updated')
    onDone()
  }

  return (
    <div className="space-y-3 pt-2 border-t border-[#E0E0E0] dark:border-[#3A3A3A]">
      <Field label={`Current ${currentType === 'pin' ? 'PIN' : 'password'}`}>
        <SecretInput
          lockType={currentType}
          value={current}
          onChange={(v) => { setCurrent(v); setError(null) }}
          autoFocus
          showPassword={showCurrent}
          onToggleShow={currentType === 'password' ? () => setShowCurrent((v) => !v) : undefined}
          placeholder={currentType === 'password' ? 'Current password' : undefined}
          autoSubmitOnFull={false}
          onEnter={() => nextRef.current?.focus()}
        />
      </Field>

      <TypeToggle value={newType} onChange={(t) => { setNewType(t); setNext(''); setConfirm(''); setError(null) }} />

      <Field label={newType === 'pin' ? 'New PIN' : 'New password'}>
        <SecretInput
          ref={nextRef}
          lockType={newType}
          value={next}
          onChange={(v) => { setNext(v); setError(null) }}
          showPassword={showNext}
          onToggleShow={newType === 'password' ? () => setShowNext((v) => !v) : undefined}
          placeholder={newType === 'password' ? 'New password' : undefined}
          autoSubmitOnFull={false}
          onEnter={() => confirmRef.current?.focus()}
        />
      </Field>
      <Field label={`Confirm new ${newType === 'pin' ? 'PIN' : 'password'}`}>
        <SecretInput
          ref={confirmRef}
          lockType={newType}
          value={confirm}
          onChange={(v) => { setConfirm(v); setError(null) }}
          showPassword={showConfirm}
          onToggleShow={newType === 'password' ? () => setShowConfirm((v) => !v) : undefined}
          placeholder={newType === 'password' ? 'Confirm new password' : undefined}
          autoSubmitOnFull={false}
          onEnter={() => handleSave()}
        />
      </Field>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      <ActionRow>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !current || !next || !confirm}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-[#1976D2] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {saving ? 'Saving…' : newType === 'pin' ? 'Update PIN' : 'Update password'}
        </button>
      </ActionRow>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Remove
// ---------------------------------------------------------------------------

function RemovePinForm({
  currentType,
  onCancel,
  onDone,
}: {
  currentType: 'pin' | 'password'
  onCancel: () => void
  onDone: () => void
}) {
  const [current, setCurrent] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleRemove() {
    if (!current) {
      setError('Enter your current PIN or password')
      return
    }
    setSaving(true)
    const result = await changePrivacyPin(current, 'none')
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    toast.success('Privacy PIN removed — hidden items are now visible')
    onDone()
  }

  return (
    <div className="space-y-3 pt-2 border-t border-[#E0E0E0] dark:border-[#3A3A3A]">
      <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
        Removing the PIN will <strong>unhide every hidden journal and entry</strong>.
        They&apos;ll reappear in the main app.
      </div>

      <Field label={`Current ${currentType === 'pin' ? 'PIN' : 'password'}`}>
        <SecretInput
          lockType={currentType}
          value={current}
          onChange={(v) => { setCurrent(v); setError(null) }}
          autoFocus
          showPassword={showCurrent}
          onToggleShow={currentType === 'password' ? () => setShowCurrent((v) => !v) : undefined}
          placeholder={currentType === 'password' ? 'Current password' : undefined}
          onEnter={() => handleRemove()}
        />
      </Field>

      {error && <p className="text-xs text-red-500 dark:text-red-400">{error}</p>}

      <ActionRow>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-sm rounded-lg text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleRemove}
          disabled={saving || !current}
          className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
        >
          {saving ? 'Removing…' : 'Remove PIN'}
        </button>
      </ActionRow>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bits
// ---------------------------------------------------------------------------

function TypeToggle({
  value,
  onChange,
}: {
  value: 'pin' | 'password'
  onChange: (v: 'pin' | 'password') => void
}) {
  return (
    <div className="inline-flex p-0.5 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg">
      {(['pin', 'password'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`px-3 py-1 text-xs font-semibold rounded-[6px] transition-colors ${
            value === t
              ? 'bg-[var(--bg-surface)] text-[#1976D2] shadow-sm border border-[var(--border)]'
              : 'text-[var(--text-secondary)]'
          }`}
        >
          {t === 'pin' ? '4-digit PIN' : 'Password'}
        </button>
      ))}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
        {label}
      </label>
      {children}
    </div>
  )
}

function ActionRow({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-1">{children}</div>
}
