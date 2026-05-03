'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { X, BookOpen, ChevronDown, Palette } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { createJournal, updateJournal } from '@/lib/actions/journals'
import {
  createJournalSchema,
  COLOR_DEFS,
  JOURNAL_ICONS,
  getColorBg,
  getColorLabel,
  type CreateJournalInput,
} from '@/lib/validations/journals'
import BookIcon from '@/components/ui/BookIcon'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']
type EmojiIcon = (typeof JOURNAL_ICONS)[number]

interface JournalModalProps {
  journal?: Journal
  onClose: () => void
  onSuccess: () => void
}

export default function JournalModal({ journal, onClose, onSuccess }: JournalModalProps) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const isEdit = !!journal

  const [colorOpen, setColorOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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

    const created = await createJournal(data)
    if ('error' in created) {
      toast.error(created.error)
      return
    }

    toast.success('Journal created')
    router.refresh()
    onSuccess()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/45 backdrop-blur-sm"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-[var(--bg-surface)] rounded-[20px] w-full max-w-[480px] overflow-hidden font-[Inter,sans-serif] max-h-[90vh] flex flex-col"
        style={{
          boxShadow: isDark
            ? '0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08)'
            : '0 24px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
        }}
      >
        {/* Header — fixed, does not scroll */}
        <div className="shrink-0 flex items-center gap-3 px-6 pt-[22px] pb-[18px] border-b border-[var(--border)]">
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

        {/* Body — form fills remaining space; the inner wrapper is the only
            scrolling element. The rounded corners live on the outer modal
            container (overflow-hidden), so the scrollbar renders inside a
            flat rectangle between the header and footer and cannot be
            clipped by the modal's curve. */}
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col min-h-0 flex-1">
          <div className="custom-scrollbar overflow-y-auto flex-1 min-h-0 px-6 pt-[22px] pb-4 flex flex-col gap-[18px]">

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

            {/* Edit mode: the form fields (name / description / color) get
                their own Save Changes footer right here so it's visually tied
                to the fields above it. The Security block below has its own
                Apply / Manage buttons, making it obvious the two sections
                don't affect each other. Create mode keeps a single footer at
                the bottom of the modal since the initial create + optional
                lock are applied in one submit. */}
            {isEdit && (
              <div className="flex gap-[10px] pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-[10px] rounded-[10px] bg-[#EEEEEE] dark:bg-[#333333] border border-[var(--border)] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[#E0E0E0] dark:hover:bg-[#404040] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !titleValue.trim()}
                  className="flex-[2] flex items-center justify-center gap-2 px-4 py-[10px] rounded-[10px] text-[13px] font-semibold transition-all disabled:cursor-not-allowed"
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
                  <BookOpen size={14} />
                  {isSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            )}

          </div>

          {/* Edit mode has no fixed footer (its Save Changes sits inline
              above the Security block), so without this spacer the
              scrollable body would reach the modal's rounded bottom edge
              and the scrollbar's last pixels would be clipped by the 20px
              corner radius. Height ≥ corner radius guarantees the scroll
              track ends above the curve. */}
          {isEdit && <div className="shrink-0 h-5" aria-hidden />}

          {/* Footer — create flow only. Fixed at the bottom of the modal
              (outside the scrolling wrapper) so the scrollbar ends above it
              and the rounded corners stay clean. Edit flow's Save Changes
              lives inside the scroll area, under the form fields. */}
          {!isEdit && (
            <div className="shrink-0 flex gap-[10px] px-6 pt-4 pb-[22px] border-t border-[var(--border)]">
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
                {isSubmitting ? 'Saving…' : 'Create Journal'}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
