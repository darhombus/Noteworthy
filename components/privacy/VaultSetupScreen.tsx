'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import SecretInput, { type SecretInputHandle } from '@/components/lock/SecretInput'
import { setVaultSecret } from '@/lib/actions/vault'

type SecretType = 'pin' | 'password'

export default function VaultSetupScreen() {
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
      toast.success('Vault set up — entries hidden here are gated by this PIN')
      router.refresh()
    })
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 space-y-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1976D2]/10 dark:bg-[#1E3A5F] flex items-center justify-center shrink-0">
            <ShieldCheck size={20} className="text-[#1976D2]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[var(--text-primary)]">Set up your Hidden vault</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Choose a PIN or password. Anything you hide will only show
              up here, after you unlock the vault.
            </p>
          </div>
        </div>

        <div className="inline-flex p-0.5 bg-[var(--bg-muted)] border border-[var(--border)] rounded-lg">
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
                  ? 'bg-[var(--bg-surface)] text-[#1976D2] shadow-sm border border-[var(--border)]'
                  : 'text-[var(--text-secondary)]'
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
            autoFocus
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
            <Shield size={14} />
            {pending ? 'Setting up…' : 'Set up vault'}
          </button>
        </div>
      </div>
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
