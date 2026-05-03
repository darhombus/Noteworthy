'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import SecretInput, { type SecretInputHandle } from '@/components/lock/SecretInput'
import { changeVaultSecret } from '@/lib/actions/vault'

type SecretType = 'pin' | 'password'

interface Props {
  currentSecretType: SecretType
  onClose: () => void
}

export default function ChangeVaultModal({ currentSecretType, onClose }: Props) {
  const router = useRouter()
  const [current, setCurrent] = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [newType, setNewType] = useState<SecretType>(currentSecretType)
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showNext, setShowNext] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const nextRef = useRef<SecretInputHandle>(null)
  const confirmRef = useRef<SecretInputHandle>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function validate(): string | null {
    if (!current) return 'Enter your current PIN or password'
    if (newType === 'pin') {
      if (!/^\d{4}$/.test(next)) return 'New PIN must be exactly 4 digits'
    } else if (next.length < 8) {
      return 'New password must be at least 8 characters'
    }
    if (next !== confirm) return 'The two new entries do not match'
    return null
  }

  function handleSubmit() {
    const err = validate()
    if (err) {
      setError(err)
      return
    }
    startTransition(async () => {
      const result = await changeVaultSecret(current, newType, next)
      if ('error' in result) {
        setError(result.error)
        return
      }
      toast.success(
        newType === 'pin' ? 'Vault PIN updated' : 'Vault password updated',
      )
      onClose()
      router.refresh()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-[#1E1E1E] rounded-xl shadow-xl w-full max-w-md border border-[#E0E0E0] dark:border-slate-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E0E0E0] dark:border-slate-700">
          <h2 className="font-semibold text-[#212121] dark:text-[#F5F5F5]">Change vault credential</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-[#F5F5F5] dark:hover:bg-[#2C2C2C] transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-[#757575] dark:text-[#9E9E9E]" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <Field label={`Current ${currentSecretType === 'pin' ? 'PIN' : 'password'}`}>
            <SecretInput
              lockType={currentSecretType}
              value={current}
              onChange={(v) => { setCurrent(v); setError(null) }}
              autoFocus
              showPassword={showCurrent}
              onToggleShow={currentSecretType === 'password' ? () => setShowCurrent((v) => !v) : undefined}
              placeholder={currentSecretType === 'password' ? 'Current password' : undefined}
              autoSubmitOnFull={false}
              onEnter={() => nextRef.current?.focus()}
            />
          </Field>

          <div className="inline-flex p-0.5 bg-[var(--bg-muted)] border border-[#E0E0E0] dark:border-slate-700 rounded-lg">
            {(['pin', 'password'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setNewType(t)
                  setNext('')
                  setConfirm('')
                  setError(null)
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-[6px] transition-colors ${
                  newType === t
                    ? 'bg-white dark:bg-[#1E1E1E] text-[#1976D2] shadow-sm border border-[#E0E0E0] dark:border-slate-700'
                    : 'text-[#757575] dark:text-[#9E9E9E]'
                }`}
              >
                {t === 'pin' ? '4-digit PIN' : 'Password'}
              </button>
            ))}
          </div>

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
              onEnter={() => handleSubmit()}
            />
          </Field>

          {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 px-6 pb-5">
          <button
            onClick={onClose}
            disabled={pending}
            className="px-3 py-1.5 text-sm rounded-lg text-[#757575] dark:text-[#9E9E9E] hover:bg-[var(--bg-muted)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending || !current || !next || !confirm}
            className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-[#1976D2] text-white hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {pending ? 'Updating…' : 'Update credential'}
          </button>
        </div>
      </div>
    </div>
  )
}

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
