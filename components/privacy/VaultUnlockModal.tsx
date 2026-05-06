'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import SecretInput, { type SecretInputHandle } from '@/components/lock/SecretInput'
import { revealBin, unlockVault } from '@/lib/actions/vault'

type UnlockResult =
  | { success: true }
  | { error: string; retryAfterSeconds?: number }

interface Props {
  secretType: 'pin' | 'password'
  onClose: () => void
  /** Which session to open on success.
   *
   *   • 'vault' (default) — full vault unlock; grants /hidden access
   *     and slides the auto-lock window forward.
   *   • 'bin'             — only opens the recycle-bin reveal cookie;
   *     /hidden remains locked. Used by the bin's "show titles"
   *     prompt so revealing items in the bin doesn't accidentally
   *     grant navigation access to /hidden. */
  mode?: 'vault' | 'bin'
  /** Custom dialog title — defaults to "Vault is locked". The bin
   *  surface uses "Reveal hidden items" so the user understands the
   *  scope of what they're unlocking. */
  heading?: string
  /** Custom subtitle — defaults to the standard /hidden message.
   *  Bin surface explains the scope of the reveal. */
  subtitle?: string
}

/**
 * In-page vault unlock dialog. Uses the same `SecretInput` widget as
 * the full-page VaultUnlockScreen so the experience is visually
 * identical — 4 PIN boxes for PIN, single password field for
 * password — regardless of which surface mounts the modal.
 *
 * On success: `router.refresh()` re-runs the surrounding server
 * components so a redacted recycle-bin row (or any other vault-gated
 * SSR view) re-renders in place with the real data. No navigation;
 * VaultAutoLock isn't triggered.
 */
export default function VaultUnlockModal({
  secretType,
  onClose,
  mode = 'vault',
  heading,
  subtitle,
}: Props) {
  const router = useRouter()
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [shakeKey, setShakeKey] = useState(0)
  const [cooldownSeconds, setCooldownSeconds] = useState(0)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<SecretInputHandle>(null)

  useEffect(() => {
    if (cooldownSeconds <= 0) return
    const id = setInterval(() => {
      setCooldownSeconds((s) => Math.max(0, s - 1))
    }, 1000)
    return () => clearInterval(id)
  }, [cooldownSeconds])

  // Force focus on mount via ref. Relying on `autoFocus` alone is
  // unreliable inside conditionally-rendered dialogs — the focus call
  // inside `setTimeout(0)` runs after React paints, by which point
  // the input definitely exists in the DOM.
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [])

  // Esc closes — but only when no submit is in flight, so a stray
  // keystroke can't dismiss the dialog mid-unlock.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !pending) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pending])

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
      const action = mode === 'bin' ? revealBin : unlockVault
      const result: UnlockResult = await action(candidate)
      if ('error' in result) {
        setError(result.error)
        setSecret('')
        setShakeKey((k) => k + 1)
        if (
          'retryAfterSeconds' in result &&
          typeof result.retryAfterSeconds === 'number'
        ) {
          setCooldownSeconds(result.retryAfterSeconds)
          toast.error(`Too many attempts — try again in ${result.retryAfterSeconds}s`)
        }
        setTimeout(() => inputRef.current?.focus(), 0)
        return
      }
      toast.success(mode === 'bin' ? 'Hidden items revealed' : 'Vault unlocked')
      router.refresh()
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose()
      }}
    >
      <div
        key={shakeKey}
        className={`w-full max-w-md mx-4 rounded-xl border border-[#E0E0E0] dark:border-slate-700 bg-white dark:bg-[#1E1E1E] p-8 shadow-sm space-y-6 ${
          error || isCooling ? 'vault-shake' : ''
        }`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#1976D2]/10 dark:bg-[#1E3A5F] flex items-center justify-center shrink-0">
            <Lock size={20} className="text-[#1976D2]" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-[#212121] dark:text-[#F5F5F5]">
              {heading ??
                (mode === 'bin' ? 'Reveal hidden items' : 'Vault is locked')}
            </h1>
            <p className="text-sm text-[#757575] dark:text-[#9E9E9E] mt-1">
              {subtitle ??
                (mode === 'bin'
                  ? `Enter your ${secretType === 'pin' ? 'PIN' : 'password'} to reveal the titles of hidden items in the recycle bin. The vault stays locked.`
                  : `Enter your ${secretType === 'pin' ? 'PIN' : 'password'} to view hidden journals and entries.`)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[#757575] hover:text-[#212121] dark:text-[#9E9E9E] dark:hover:text-[#F5F5F5] disabled:opacity-50"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#757575] dark:text-[#9E9E9E] mb-1.5">
            {secretType === 'pin' ? 'PIN' : 'Password'}
          </label>
          <SecretInput
            ref={inputRef}
            lockType={secretType}
            value={secret}
            onChange={(v) => {
              setSecret(v)
              setError(null)
            }}
            autoFocus
            showPassword={showSecret}
            onToggleShow={
              secretType === 'password' ? () => setShowSecret((v) => !v) : undefined
            }
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
            type="button"
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
