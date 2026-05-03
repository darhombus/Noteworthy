'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import SecretInput, { type SecretInputHandle } from '@/components/lock/SecretInput'
import { unlockVault } from '@/lib/actions/vault'
import { useUIStore } from '@/store/useUIStore'

interface Props {
  secretType: 'pin' | 'password'
}

export default function VaultUnlockScreen({ secretType }: Props) {
  const router = useRouter()
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<SecretInputHandle>(null)
  const setHiddenVaultLocked = useUIStore((s) => s.setHiddenVaultLocked)

  // Mark the surface as locked so TopBar suppresses its "Search vault"
  // affordance — there's no vault content to search until we unlock.
  useEffect(() => {
    setHiddenVaultLocked(true)
    return () => setHiddenVaultLocked(false)
  }, [setHiddenVaultLocked])

  // Tick down the cooldown countdown from the server. The server is the
  // source of truth — this UI counter just tells the user when they can
  // try again. If they refresh, a fresh attempt re-derives the state.
  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const id = setInterval(() => {
      setCooldownSeconds((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [cooldownSeconds])

  const isCooling = cooldownSeconds > 0

  function handleSubmit(value?: string) {
    if (isCooling) return
    const candidate = value ?? secret
    if (!candidate) {
      setError(secretType === 'pin' ? 'Enter your 4-digit PIN' : 'Enter your password')
      setShakeKey((k) => k + 1)
      return
    }
    startTransition(async () => {
      const result = await unlockVault(candidate)
      if ('error' in result) {
        setError(result.error)
        setSecret('')
        setShakeKey((k) => k + 1)
        // Server-side rate limiter signals "too many tries" with a
        // retryAfterSeconds payload. Mirror it locally and surface a toast.
        if ('retryAfterSeconds' in result && typeof result.retryAfterSeconds === 'number') {
          setCooldownSeconds(result.retryAfterSeconds)
          toast.error(`Too many attempts — try again in ${result.retryAfterSeconds}s`)
        }
        setTimeout(() => inputRef.current?.focus(), 0)
        return
      }
      router.refresh()
    })
  }

  return (
    <div className="max-w-md mx-auto py-12">
      <div
        key={shakeKey}
        className={`rounded-xl border border-[#E0E0E0] dark:border-slate-700 bg-white dark:bg-[#1E1E1E] p-8 space-y-6 shadow-sm ${error || isCooling ? 'vault-shake' : ''}`}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1976D2]/10 dark:bg-[#1E3A5F] flex items-center justify-center shrink-0">
            <Lock size={20} className="text-[#1976D2]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-[#212121] dark:text-[#F5F5F5]">Vault is locked</h1>
            <p className="text-sm text-[#757575] dark:text-[#9E9E9E] mt-1">
              Enter your {secretType === 'pin' ? 'PIN' : 'password'} to view hidden journals and entries.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#757575] dark:text-[#9E9E9E] mb-1.5">
            {secretType === 'pin' ? 'PIN' : 'Password'}
          </label>
          <SecretInput
            ref={inputRef}
            lockType={secretType}
            value={secret}
            onChange={(v) => { setSecret(v); setError(null) }}
            autoFocus
            showPassword={showSecret}
            onToggleShow={secretType === 'password' ? () => setShowSecret((v) => !v) : undefined}
            placeholder={secretType === 'password' ? 'Enter password' : undefined}
            onEnter={(value) => handleSubmit(value)}
          />
        </div>

        {error && (
          <p className="text-sm text-red-500 dark:text-red-400">
            {isCooling ? `Too many attempts. Try again in ${cooldownSeconds}s` : error}
          </p>
        )}

        <div className="flex justify-end pt-1">
          <button
            onClick={() => handleSubmit()}
            disabled={pending || !secret || isCooling}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[#1976D2] text-white hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ShieldCheck size={14} />
            {pending ? 'Unlocking…' : isCooling ? `Wait ${cooldownSeconds}s` : 'Unlock'}
          </button>
        </div>
      </div>
    </div>
  )
}
