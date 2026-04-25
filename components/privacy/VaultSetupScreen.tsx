'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import SecretInput, { type SecretInputHandle } from '@/components/lock/SecretInput'
import { setPrivacyPin } from '@/lib/actions/privacy'

/**
 * First-run setup screen. Shown from /hidden when the user has no
 * Privacy PIN yet. Matches the Unlock screen's structure so the
 * vault surface feels consistent.
 */
export default function VaultSetupScreen() {
  const router = useRouter()
  const [pinType, setPinType] = useState<'pin' | 'password'>('pin')
  const [secret, setSecret] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const confirmRef = useRef<SecretInputHandle>(null)

  function validateShape(): string | null {
    if (pinType === 'pin') {
      if (!/^\d{4}$/.test(secret)) return 'PIN must be exactly 4 digits'
    } else {
      if (secret.length < 4) return 'Password must be at least 4 characters'
    }
    if (secret !== confirm) return 'The two entries do not match'
    return null
  }

  async function handleSave() {
    const shape = validateShape()
    if (shape) {
      setError(shape)
      return
    }
    setSaving(true)
    setError(null)
    const result = await setPrivacyPin(pinType, secret)
    setSaving(false)
    if ('error' in result) {
      setError(result.error)
      return
    }
    toast.success('Privacy PIN created')
    router.refresh()
  }

  return (
    <div className="relative min-h-[60vh] flex items-center justify-center p-6">
      <button
        type="button"
        onClick={() => router.push('/dashboard')}
        className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-muted)] transition-colors"
        aria-label="Go back"
      >
        <ArrowLeft size={16} />
        <span>Back</span>
      </button>

      <div className="w-full max-w-[400px] flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-[#1976D2]/10 dark:bg-[#1E3A5F] flex items-center justify-center">
          <Shield size={28} className="text-[#1976D2]" />
        </div>

        <div className="text-center">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Set up Private Vault</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Create a PIN or password to hide journals and entries. You&apos;ll need it to view them again.
          </p>
        </div>

        {/* Type toggle */}
        <div className="flex p-0.5 bg-[var(--bg-muted)] border border-[var(--border)] rounded-xl self-center">
          {(['pin', 'password'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                setPinType(t)
                setSecret('')
                setConfirm('')
                setError(null)
              }}
              className={`px-4 py-1.5 text-xs font-semibold rounded-[10px] transition-colors ${
                pinType === t
                  ? 'bg-[var(--bg-surface)] text-[#1976D2] shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-secondary)]'
              }`}
            >
              {t === 'pin' ? '4-digit PIN' : 'Password'}
            </button>
          ))}
        </div>

        <div className="w-full flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
              {pinType === 'pin' ? 'New PIN' : 'New password'}
            </label>
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
          </div>
          <div>
            <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
              Confirm {pinType === 'pin' ? 'PIN' : 'password'}
            </label>
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
          </div>
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !secret || !confirm}
          className="w-full py-3 rounded-xl bg-[#1976D2] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving…' : pinType === 'pin' ? 'Save PIN' : 'Save password'}
        </button>
      </div>
    </div>
  )
}
