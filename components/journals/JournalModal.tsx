'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, BookOpen, ChevronDown, Palette, ShieldCheck, Lock, LockOpen, Hash, KeyRound } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { createJournal, updateJournal } from '@/lib/actions/journals'
import { setLock } from '@/lib/actions/lock'
import {
  createJournalSchema,
  COLOR_DEFS,
  JOURNAL_ICONS,
  getColorBg,
  getColorLabel,
  type CreateJournalInput,
  type LockType,
} from '@/lib/validations/journals'
import BookIcon from '@/components/ui/BookIcon'
import LockPicker from '@/components/lock/LockPicker'
import SecretInput from '@/components/lock/SecretInput'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']
type EmojiIcon = (typeof JOURNAL_ICONS)[number]

interface JournalModalProps {
  journal?: Journal
  onClose: () => void
  onSuccess: () => void
}

function lockSummary(type: LockType): { label: string; icon: React.ReactNode } {
  if (type === 'pin') return { label: 'Locked with a 4-digit PIN', icon: <Hash size={12} /> }
  if (type === 'password') return { label: 'Locked with a password', icon: <KeyRound size={12} /> }
  return { label: 'No lock set', icon: <LockOpen size={12} /> }
}

export default function JournalModal({ journal, onClose, onSuccess }: JournalModalProps) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const isEdit = !!journal

  const [colorOpen, setColorOpen] = useState(false)

  // Lock state is fully separate from the journal form — it's applied via a
  // dedicated `setLock` call, never mixed into `updateJournal`. That removes
  // any chance of a journal save accidentally clearing the lock.
  const currentLockType: LockType = (journal?.lock_type as LockType | undefined) ?? 'none'
  const [pickerOpen, setPickerOpen] = useState<boolean>(!isEdit && false)
  const [draftLockType, setDraftLockType] = useState<LockType>(
    isEdit ? currentLockType : 'none',
  )
  const [draftSecret, setDraftSecret] = useState('')
  const [isSavingLock, setIsSavingLock] = useState(false)

  // Changing/removing an existing journal lock requires the caller to type
  // the current PIN/password first. `currentSecret` is collected inline
  // above the picker when `currentLockType !== 'none'` on edit.
  const [currentSecret, setCurrentSecret] = useState('')
  const [showCurrentSecret, setShowCurrentSecret] = useState(false)
  const [currentSecretError, setCurrentSecretError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateJournalInput>({
    resolver: zodResolver(createJournalSchema),
    defaultValues: {
      title: journal?.title ?? '',
      description: journal?.description ?? '',
      color: (COLOR_DEFS.some((d) => d.value === journal?.color)
        ? journal!.color
        : COLOR_DEFS[0].value) as CreateJournalInput['color'],
      icon: (JOURNAL_ICONS.includes(journal?.icon as EmojiIcon)
        ? journal!.icon
        : JOURNAL_ICONS[0]) as EmojiIcon,
    },
  })

  const selectedColor = watch('color')
  const titleValue = watch('title') ?? ''
  const descValue = watch('description') ?? ''

  const colorBg = getColorBg(selectedColor)
  const colorLabel = getColorLabel(selectedColor)
  const emojiBg = isDark ? `${selectedColor}25` : colorBg

  function validateDraftLock(): string | null {
    if (draftLockType === 'pin' && !/^\d{4}$/.test(draftSecret)) {
      return 'Please enter all 4 PIN digits'
    }
    if (draftLockType === 'password' && draftSecret.length === 0) {
      return 'Please enter a password'
    }
    return null
  }

  async function applyDraftLock(
    journalId: string,
    hasExistingLock: boolean,
  ): Promise<boolean> {
    const err = validateDraftLock()
    if (err) {
      toast.error(err)
      return false
    }
    if (hasExistingLock) {
      const len = currentLockType === 'pin' ? 4 : 1
      if (currentSecret.length < len) {
        setCurrentSecretError(
          currentLockType === 'pin' ? 'Enter all 4 PIN digits' : 'Enter your password',
        )
        return false
      }
    }
    const result = await setLock(
      journalId,
      'journal',
      draftLockType,
      draftLockType === 'none' ? undefined : draftSecret,
      hasExistingLock ? currentSecret : undefined,
    )
    if ('error' in result) {
      if (hasExistingLock) {
        setCurrentSecretError(result.error || 'Failed to update lock')
        setCurrentSecret('')
      } else {
        toast.error(result.error || 'Failed to update lock')
      }
      return false
    }
    return true
  }

  async function handleApplyLockOnEdit() {
    if (!journal) return
    setIsSavingLock(true)
    setCurrentSecretError(null)
    const hasExistingLock = currentLockType !== 'none'
    const ok = await applyDraftLock(journal.journal_id, hasExistingLock)
    setIsSavingLock(false)
    if (!ok) return
    toast.success(draftLockType === 'none' ? 'Lock removed' : 'Lock updated')
    setPickerOpen(false)
    setDraftSecret('')
    setCurrentSecret('')
    router.refresh()
  }

  async function onSubmit(data: CreateJournalInput) {
    if (isEdit) {
      const result = await updateJournal(journal.journal_id, data)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success('Journal updated')
      router.refresh()
      onSuccess()
      return
    }

    // Create flow — if user configured a lock in the picker, validate it up
    // front before we create the row so we don't end up with an orphan
    // unlocked journal on a validation failure.
    if (draftLockType !== 'none') {
      const err = validateDraftLock()
      if (err) {
        toast.error(err)
        return
      }
    }

    const created = await createJournal(data)
    if ('error' in created) {
      toast.error(created.error)
      return
    }

    if (draftLockType !== 'none') {
      // Freshly-created journal has no existing lock — no currentSecret needed.
      const lockOk = await applyDraftLock(created.journal.journal_id, false)
      if (!lockOk) {
        // The journal was created without a lock. Surface the error and still
        // close so the user can inspect it in the list.
        toast.error('Journal created, but the lock could not be applied. Set it from Edit.')
      }
    }

    toast.success('Journal created')
    router.refresh()
    onSuccess()
  }

  const summary = lockSummary(currentLockType)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/45 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="bg-[var(--bg-surface)] rounded-[20px] w-full max-w-[480px] overflow-hidden font-[Inter,sans-serif] max-h-[90vh] overflow-y-auto"
        style={{
          boxShadow: isDark
            ? '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)'
            : '0 24px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 pt-[22px] pb-[18px] border-b border-[var(--border)]">
          <div
            className="flex items-center justify-center w-9 h-9 rounded-[10px] shrink-0"
            style={{
              background: 'linear-gradient(135deg, #1976D2, #1565C0)',
              boxShadow: '0 4px 10px rgba(25,118,210,0.3)',
            }}
          >
            <BookOpen size={17} color="#fff" />
          </div>
          <div className="flex-1 min-w-0">
            <h2
              className="text-base font-bold text-[var(--text-primary)] leading-tight"
              style={{ letterSpacing: '-0.3px' }}
            >
              {isEdit ? 'Edit Journal' : 'Create New Journal'}
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              A journal holds your entries &amp; notes
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#EEEEEE] dark:bg-[#333333] border border-[var(--border)] hover:bg-[#E0E0E0] dark:hover:bg-[#3A3A3A] transition-colors shrink-0"
            aria-label="Close"
          >
            <X size={14} className="text-[var(--text-secondary)]" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit(onSubmit)}>
          <div className="px-6 pt-[22px] pb-4 flex flex-col gap-[18px]">

            {/* Color picker */}
            <div>
              <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-2 flex items-center gap-1" style={{ letterSpacing: '0.5px' }}>
                <Palette size={11} />
                Cover Color
              </p>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setColorOpen((prev) => !prev)}
                  className="w-full flex items-center gap-2 px-3 py-[9px] rounded-[10px] bg-[#EEEEEE] dark:bg-[#333333] border border-[var(--border)] hover:bg-[#E5E5E5] dark:hover:bg-[#404040] transition-colors"
                >
                  <span
                    className="inline-block w-[18px] h-[18px] rounded-full shrink-0"
                    style={{ background: selectedColor }}
                  />
                  <span className="flex-1 text-left text-[var(--text-primary)] text-[13px]">
                    {colorLabel}
                  </span>
                  <ChevronDown
                    size={13}
                    className={`text-[#9E9E9E] transition-transform duration-200 ${colorOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {colorOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 p-2 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border)] z-10 shadow-lg">
                    <div className="grid grid-cols-4 gap-1.5">
                      {COLOR_DEFS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          onClick={() => {
                            setValue('color', c.value as CreateJournalInput['color'])
                            setColorOpen(false)
                          }}
                          className="flex flex-col items-center gap-1 p-1.5 rounded-lg hover:bg-[#F5F5F5] dark:hover:bg-[#3A3A3A] transition-colors"
                        >
                          <span
                            className="inline-block w-[22px] h-[22px] rounded-full"
                            style={{ background: c.value }}
                          />
                          <span className="text-[9px] text-[var(--text-muted)]">
                            {c.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Preview card */}
            <div
              className="flex items-center gap-4 p-4 rounded-xl border border-[var(--border)]"
              style={{ background: isDark ? '#2A2A2A' : '#F8F9FA' }}
            >
              {/* Book thumbnail */}
              <div className="shrink-0">
                <BookIcon color={selectedColor} size={52} />
              </div>

              {/* Meta */}
              <div className="min-w-0 flex-1">
                <p
                  className="text-[14px] font-semibold leading-tight truncate"
                  style={{ color: titleValue ? (isDark ? '#F5F5F5' : '#212121') : '#9E9E9E' }}
                >
                  {titleValue || 'Journal Name'}
                </p>
                {descValue && (
                  <p className="text-[11px] text-[#9E9E9E] truncate mt-0.5">{descValue}</p>
                )}
                <span
                  className="inline-block mt-2 px-[10px] py-0.5 rounded-full text-[10px] font-semibold"
                  style={{ color: selectedColor, background: emojiBg }}
                >
                  0 entries
                </span>
              </div>
            </div>

            {/* Journal name */}
            <div>
              <label
                className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1.5"
                style={{ letterSpacing: '0.5px' }}
              >
                Journal Name <span className="text-red-500 normal-case font-normal">*</span>
              </label>
              <input
                {...register('title')}
                placeholder="e.g. Personal Journal, Work Notes…"
                className="w-full px-[14px] py-[10px] rounded-[10px] bg-[#EEEEEE] dark:bg-[#333333] text-[14px] text-[var(--text-primary)] placeholder-[#9E9E9E] focus:outline-none transition-colors"
                style={{
                  border: titleValue
                    ? `1px solid ${selectedColor}`
                    : `1px solid ${isDark ? '#3A3A3A' : '#E0E0E0'}`,
                }}
              />
              {errors.title && (
                <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>
              )}
            </div>

            {/* Description */}
            <div>
              <label
                className="block text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-1.5"
                style={{ letterSpacing: '0.5px' }}
              >
                Description{' '}
                <span className="font-normal normal-case text-[#9E9E9E]">(optional)</span>
              </label>
              <textarea
                {...register('description')}
                rows={2}
                placeholder="What will you write about in this journal?"
                className="w-full px-[14px] py-[10px] rounded-[10px] bg-[#EEEEEE] dark:bg-[#333333] border border-[var(--border)] text-[13px] text-[var(--text-primary)] placeholder-[#9E9E9E] focus:outline-none resize-none"
                style={{ lineHeight: '1.55' }}
              />
              {errors.description && (
                <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
              )}
            </div>

            {/* Security / Lock section — fully independent of the form submit.
                On edit, applying a lock hits setLock directly; on create, the
                picker's draft is applied after the journal row exists. */}
            <div>
              <p
                className="text-[11px] font-semibold text-[var(--text-muted)] uppercase mb-2 flex items-center gap-1"
                style={{ letterSpacing: '0.5px' }}
              >
                <ShieldCheck size={11} />
                Security
              </p>

              {isEdit && !pickerOpen && (
                <div className="p-3 rounded-[10px] bg-[#EEEEEE] dark:bg-[#333333] border border-[var(--border)] flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: currentLockType === 'none'
                        ? (isDark ? '#2C2C2C' : '#E0E0E0')
                        : 'rgba(25,118,210,0.12)',
                      color: currentLockType === 'none' ? '#9E9E9E' : '#1976D2',
                    }}
                  >
                    {currentLockType === 'none' ? <LockOpen size={14} /> : <Lock size={14} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[var(--text-primary)] flex items-center gap-1.5">
                      {summary.icon}
                      {summary.label}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)] truncate">
                      {currentLockType === 'none'
                        ? 'Add a PIN or password to hide this journal.'
                        : 'You can change or remove this lock below.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setDraftLockType(currentLockType)
                      setDraftSecret('')
                      setPickerOpen(true)
                    }}
                    className="text-xs font-semibold text-[#1976D2] px-2.5 py-1.5 rounded-lg hover:bg-[#1976D2]/10 transition-colors shrink-0"
                  >
                    {currentLockType === 'none' ? 'Add lock' : 'Change'}
                  </button>
                </div>
              )}

              {(!isEdit || pickerOpen) && (
                <div className="p-3 rounded-[10px] bg-[#EEEEEE] dark:bg-[#333333] border border-[var(--border)] space-y-3">
                  {isEdit && currentLockType !== 'none' && (
                    <div className="space-y-2 pb-3 border-b border-[var(--border)]">
                      <p className="text-[11px] font-semibold text-[var(--text-muted)] uppercase" style={{ letterSpacing: '0.5px' }}>
                        Current {currentLockType === 'pin' ? 'PIN' : 'password'}
                      </p>
                      <SecretInput
                        lockType={currentLockType === 'pin' ? 'pin' : 'password'}
                        value={currentSecret}
                        onChange={(v) => { setCurrentSecret(v); setCurrentSecretError(null) }}
                        error={!!currentSecretError}
                        showPassword={showCurrentSecret}
                        onToggleShow={() => setShowCurrentSecret((v) => !v)}
                      />
                      {currentSecretError && (
                        <p className="text-xs text-red-500 dark:text-red-400">{currentSecretError}</p>
                      )}
                    </div>
                  )}
                  <LockPicker
                    lockType={draftLockType}
                    onChange={(type, secret) => {
                      setDraftLockType(type)
                      setDraftSecret(secret)
                    }}
                    hint={
                      isEdit && currentLockType !== 'none'
                        ? 'This will replace the current lock.'
                        : undefined
                    }
                  />
                  {isEdit && (
                    <div className="flex gap-2 mt-3">
                      <button
                        type="button"
                        onClick={() => {
                          setPickerOpen(false)
                          setDraftLockType(currentLockType)
                          setDraftSecret('')
                          setCurrentSecret('')
                          setCurrentSecretError(null)
                        }}
                        className="flex-1 py-2 rounded-lg border border-[var(--border)] text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyLockOnEdit}
                        disabled={isSavingLock}
                        className="flex-[2] py-2 rounded-lg bg-[#1976D2] text-white text-xs font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                      >
                        {isSavingLock
                          ? 'Saving…'
                          : draftLockType === 'none'
                            ? 'Remove lock'
                            : 'Apply lock'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-[10px] px-6 pt-4 pb-[22px] border-t border-[var(--border)]">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-[11px] rounded-[10px] bg-[#EEEEEE] dark:bg-[#333333] border border-[var(--border)] text-[14px] font-medium text-[var(--text-primary)] hover:bg-[#E0E0E0] dark:hover:bg-[#404040] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !titleValue.trim()}
              className="flex-[2] flex items-center justify-center gap-2 px-4 py-[11px] rounded-[10px] text-[14px] font-semibold transition-all disabled:cursor-not-allowed"
              style={
                titleValue.trim()
                  ? {
                      background: 'linear-gradient(135deg, #1976D2, #1565C0)',
                      color: '#fff',
                      boxShadow: '0 4px 12px rgba(25,118,210,0.35)',
                    }
                  : {
                      background: isDark ? '#2C2C2C' : '#EEEEEE',
                      color: '#9E9E9E',
                    }
              }
            >
              <BookOpen size={15} />
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Journal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
