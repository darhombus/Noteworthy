'use client'

import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  X,
  Check,
  Book,
  Star,
  Heart,
  Briefcase,
  Globe,
  Music,
  Camera,
  Coffee,
  type LucideProps,
} from 'lucide-react'
import { toast } from 'sonner'
import { createJournal, updateJournal } from '@/lib/actions/journals'
import {
  createJournalSchema,
  JOURNAL_COLORS,
  JOURNAL_ICONS,
  type CreateJournalInput,
} from '@/lib/validations/journals'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']
type IconName = (typeof JOURNAL_ICONS)[number]

const ICON_MAP: Record<IconName, React.ComponentType<LucideProps>> = {
  book: Book,
  star: Star,
  heart: Heart,
  briefcase: Briefcase,
  globe: Globe,
  music: Music,
  camera: Camera,
  coffee: Coffee,
}

interface JournalModalProps {
  journal?: Journal
  onClose: () => void
  onSuccess: () => void
}

export default function JournalModal({ journal, onClose, onSuccess }: JournalModalProps) {
  const router = useRouter()
  const isEdit = !!journal

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
      color: (journal?.color as (typeof JOURNAL_COLORS)[number]) ?? JOURNAL_COLORS[0],
      icon: (journal?.icon as IconName) ?? 'book',
    },
  })

  const selectedColor = watch('color')
  const selectedIcon = watch('icon')

  async function onSubmit(data: CreateJournalInput) {
    const result = isEdit
      ? await updateJournal(journal.journal_id, data)
      : await createJournal(data)

    if ('error' in result) {
      toast.error(result.error)
      return
    }

    toast.success(isEdit ? 'Journal updated' : 'Journal created')
    router.refresh()
    onSuccess()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md border border-[#E5E7EB] dark:border-slate-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB] dark:border-slate-700">
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {isEdit ? 'Edit Journal' : 'New Journal'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-slate-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="px-6 py-4 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              {...register('title')}
              placeholder="My Journal"
              className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] placeholder-gray-400 dark:placeholder-slate-500"
            />
            {errors.title && (
              <p className="mt-1 text-xs text-red-500">{errors.title.message}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              {...register('description')}
              rows={2}
              placeholder="What is this journal about?"
              className="w-full px-3 py-2 rounded-lg border border-[#E5E7EB] dark:border-slate-700 bg-white dark:bg-slate-900 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--brand)] resize-none placeholder-gray-400 dark:placeholder-slate-500"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-500">{errors.description.message}</p>
            )}
          </div>

          {/* Colour picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
              Colour
            </label>
            <div className="flex gap-2 flex-wrap">
              {JOURNAL_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setValue('color', color)}
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--brand)]"
                  style={{ backgroundColor: color }}
                  aria-label={color}
                >
                  {selectedColor === color && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
          </div>

          {/* Icon picker */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
              Icon
            </label>
            <div className="grid grid-cols-8 gap-2">
              {JOURNAL_ICONS.map((iconName) => {
                const IconComp = ICON_MAP[iconName]
                return (
                  <button
                    key={iconName}
                    type="button"
                    onClick={() => setValue('icon', iconName)}
                    className={`p-2 rounded-lg flex items-center justify-center transition-colors focus:outline-none ${
                      selectedIcon === iconName
                        ? 'bg-[var(--brand)] text-white'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                    }`}
                    aria-label={iconName}
                  >
                    <IconComp className="w-4 h-4" />
                  </button>
                )
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[var(--brand)] rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Journal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
