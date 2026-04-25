'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, ArrowLeft } from 'lucide-react'
import SecretInput from '@/components/lock/SecretInput'
import { unlockVault } from '@/lib/actions/privacy'

interface Props {
  pinType: 'pin' | 'password'
}

export default function VaultUnlockScreen({ pinType }: Props) {
  const router = useRouter()
  const [secret, setSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [shake, setShake] = useState(false)

  function triggerShake() {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  async function handleVerify(value?: string) {
    const toVerify = value ?? secret
    if (!toVerify || (pinType === 'pin' && toVerify.length < 4)) return

    setVerifying(true)
    setError(null)
    const result = await unlockVault(toVerify)
    setVerifying(false)

    if ('error' in result) {
      setError(result.error)
      setSecret('')
      triggerShake()
    } else {
      router.refresh()
    }
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

      <div className="w-full max-w-[360px] flex flex-col items-center gap-6">
        <div className="w-16 h-16 rounded-2xl bg-[#1976D2]/10 dark:bg-[#1E3A5F] flex items-center justify-center">
          <Shield size={28} className="text-[#1976D2]" />
        </div>

        <div className="text-center">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Private Vault</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            {pinType === 'pin'
              ? 'Enter your 4-digit PIN to view hidden items'
              : 'Enter your password to view hidden items'}
          </p>
        </div>

        <div className={`w-full flex flex-col items-center gap-2 ${shake ? 'animate-[shake_0.4s_ease]' : ''}`}>
          <SecretInput
            lockType={pinType}
            value={secret}
            onChange={(v) => { setSecret(v); setError(null) }}
            error={!!error}
            autoFocus
            showPassword={showSecret}
            onToggleShow={() => setShowSecret((v) => !v)}
            onEnter={(v) => handleVerify(v)}
          />
          {error && (
            <p className="text-xs text-red-500 dark:text-red-400 text-center">{error}</p>
          )}
        </div>

        {pinType === 'password' && (
          <button
            onClick={() => handleVerify()}
            disabled={verifying || !secret}
            className="w-full py-3 rounded-xl bg-[#1976D2] text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {verifying ? 'Verifying…' : 'Unlock'}
          </button>
        )}

        {verifying && pinType === 'pin' && (
          <p className="text-xs text-[var(--text-muted)]">Verifying…</p>
        )}

        <p className="text-xs text-[var(--text-muted)] text-center">
          Forgot PIN? You can reset it in Settings → Privacy.
        </p>
      </div>

      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-5px); }
          80%      { transform: translateX(5px); }
        }
      `}</style>
    </div>
  )
}
