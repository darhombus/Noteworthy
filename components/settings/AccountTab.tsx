'use client'

import { useState, useRef, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Camera, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useUIStore } from '@/store/useUIStore'
import {
  updateDisplayName,
  updateAvatarUrl,
  changeEmail,
  changePassword,
} from '@/lib/actions/settings'

interface Props {
  userId: string
  email: string
  fullName: string
  avatarUrl: string | null
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] p-6 space-y-4">
      <h2 className="text-base font-semibold text-[#212121] dark:text-[#F5F5F5]">{title}</h2>
      {children}
    </div>
  )
}

function FieldError({ msg }: { msg: string }) {
  return <p className="text-sm text-red-600 dark:text-red-400">{msg}</p>
}

export default function AccountTab({ userId, email, fullName, avatarUrl }: Props) {
  const router = useRouter()
  const { setProfile, setProfileAvatarUrl } = useUIStore()

  // ─── Profile Picture ───────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [currentAvatar, setCurrentAvatar] = useState<string | null>(avatarUrl)
  const [avatarLoading, setAvatarLoading] = useState(false)

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file')
      return
    }
    setAvatarLoading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()
      const path = `${userId}/avatar.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true })
      if (uploadError) throw uploadError

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
      // Bust cache with a timestamp query param
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`

      const result = await updateAvatarUrl(publicUrl)
      if (result.error) throw new Error(result.error)

      setCurrentAvatar(publicUrl)
      setProfileAvatarUrl(publicUrl)
      toast.success('Profile photo updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to upload photo')
    } finally {
      setAvatarLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ─── Display Name ──────────────────────────────────────────────────────────
  const [displayName, setDisplayName] = useState(fullName)
  const [nameLoading, setNameLoading] = useState(false)
  const [nameError, setNameError] = useState('')

  async function handleSaveName() {
    const trimmed = displayName.trim()
    if (!trimmed) { setNameError('Name cannot be empty'); return }
    setNameError('')
    setNameLoading(true)
    const result = await updateDisplayName(trimmed)
    setNameLoading(false)
    if (result.error) {
      setNameError(result.error)
    } else {
      setProfile({ userId, name: trimmed, avatarUrl: currentAvatar })
      toast.success('Display name updated')
    }
  }

  // ─── Change Email ──────────────────────────────────────────────────────────
  const [newEmail, setNewEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailLoading, setEmailLoading] = useState(false)
  const [emailError, setEmailError] = useState('')

  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    if (!newEmail.trim()) { setEmailError('New email is required'); return }
    setEmailLoading(true)
    const result = await changeEmail(emailPassword, newEmail.trim())
    setEmailLoading(false)
    if (result.error) {
      setEmailError(result.error)
    } else {
      toast.success('Confirmation sent — check your new email inbox')
      setNewEmail('')
      setEmailPassword('')
    }
  }

  // ─── Change Password ───────────────────────────────────────────────────────
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (newPw.length < 8) { setPwError('New password must be at least 8 characters'); return }
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    setPwLoading(true)
    const result = await changePassword(currentPw, newPw)
    setPwLoading(false)
    if (result.error) {
      setPwError(result.error)
    } else {
      toast.success('Password updated')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    }
  }

  // ─── Danger Zone ───────────────────────────────────────────────────────────
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [, startTransition] = useTransition()
  const canDelete = deleteConfirm === 'DELETE'

  async function handleDeleteAccount() {
    if (!canDelete) return
    setDeleteLoading(true)
    try {
      const res = await fetch('/api/account/delete', { method: 'POST' })
      if (!res.ok) throw new Error('Deletion failed — please try again')
      const supabase = createClient()
      await supabase.auth.signOut()
      startTransition(() => router.push('/'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong')
      setDeleteLoading(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-[#FAFAFA] dark:bg-[#121212] px-3 py-2 text-sm text-[#212121] dark:text-[#F5F5F5] placeholder:text-[#9E9E9E] focus:border-[#1976D2] focus:outline-none focus:ring-1 focus:ring-[#1976D2]'
  const btnPrimary =
    'px-4 py-2 rounded-lg bg-[#1976D2] text-white text-sm font-medium hover:bg-[#1565C0] disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
  const btnSecondary =
    'px-4 py-2 rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] text-sm font-medium text-[#212121] dark:text-[#F5F5F5] hover:bg-[#F5F5F5] dark:hover:bg-[#2C2C2C] disabled:opacity-50 transition-colors'

  return (
    <div className="space-y-5">
      {/* Profile Picture */}
      <SectionCard title="Profile picture">
        <div className="flex items-center gap-5">
          <div className="relative flex-shrink-0">
            {currentAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentAvatar}
                alt="Avatar"
                className="w-20 h-20 rounded-full object-cover"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#1976D2] text-white text-2xl font-bold flex items-center justify-center">
                {getInitials(displayName.trim() || email.split('@')[0])}
              </div>
            )}
            {avatarLoading && (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            )}
          </div>
          <div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarLoading}
              className="flex items-center gap-2 text-sm text-[#1976D2] hover:underline disabled:opacity-50"
            >
              <Camera className="w-4 h-4" />
              Change photo
            </button>
            <p className="text-xs text-[#757575] dark:text-[#9E9E9E] mt-1">
              JPG, PNG or GIF — max 5 MB
            </p>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleAvatarChange}
        />
      </SectionCard>

      {/* Display Name */}
      <SectionCard title="Display name">
        <div className="flex gap-3">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            className={inputClass + ' flex-1'}
          />
          <button
            onClick={handleSaveName}
            disabled={nameLoading || displayName.trim() === fullName}
            className={btnPrimary}
          >
            {nameLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
          </button>
        </div>
        {nameError && <FieldError msg={nameError} />}
      </SectionCard>

      {/* Email */}
      <SectionCard title="Email address">
        <div>
          <p className="text-sm text-[#757575] dark:text-[#9E9E9E] mb-4">
            Current email: <span className="font-medium text-[#212121] dark:text-[#F5F5F5]">{email}</span>
          </p>
          <form onSubmit={handleChangeEmail} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[#757575] dark:text-[#9E9E9E] mb-1">
                New email address
              </label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="new@example.com"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#757575] dark:text-[#9E9E9E] mb-1">
                Current password
              </label>
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                placeholder="Verify your password"
                className={inputClass}
              />
            </div>
            {emailError && <FieldError msg={emailError} />}
            <div className="flex justify-end">
              <button type="submit" disabled={emailLoading} className={btnPrimary}>
                {emailLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Change email'}
              </button>
            </div>
          </form>
        </div>
      </SectionCard>

      {/* Change Password */}
      <SectionCard title="Change password">
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[#757575] dark:text-[#9E9E9E] mb-1">
              Current password
            </label>
            <input
              type="password"
              value={currentPw}
              onChange={(e) => setCurrentPw(e.target.value)}
              placeholder="Current password"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#757575] dark:text-[#9E9E9E] mb-1">
              New password
            </label>
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Minimum 8 characters"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#757575] dark:text-[#9E9E9E] mb-1">
              Confirm new password
            </label>
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              placeholder="Repeat new password"
              className={inputClass}
            />
          </div>
          {pwError && <FieldError msg={pwError} />}
          <div className="flex justify-end">
            <button type="submit" disabled={pwLoading} className={btnPrimary}>
              {pwLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Update password'}
            </button>
          </div>
        </form>
      </SectionCard>

      {/* Danger Zone */}
      <div className="rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/10 p-6 space-y-4">
        <h2 className="text-base font-semibold text-red-700 dark:text-red-400">Danger zone</h2>
        <p className="text-sm text-red-600 dark:text-red-400">
          Permanently delete your account and all your data. This action cannot be undone.
        </p>
        <div className="space-y-2">
          <label className="block text-xs font-medium text-red-600 dark:text-red-400">
            Type <span className="font-mono font-bold">DELETE</span> to confirm:
          </label>
          <input
            type="text"
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder="DELETE"
            className="w-full rounded-lg border border-red-300 dark:border-red-700 bg-white dark:bg-[#1E1E1E] px-3 py-2 text-sm text-[#212121] dark:text-[#F5F5F5] placeholder:text-red-300 dark:placeholder:text-red-800 focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
          />
        </div>
        <button
          onClick={handleDeleteAccount}
          disabled={!canDelete || deleteLoading}
          className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
        >
          {deleteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
          Delete account
        </button>
      </div>
    </div>
  )
}
