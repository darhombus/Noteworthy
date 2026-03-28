'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal, Calendar, Star } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { toggleFavourite } from '@/lib/actions/journals'
import { getColorBg } from '@/lib/validations/journals'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']

interface JournalCardProps {
  journal: Journal
  onEdit: () => void
  onDelete: () => void
}

export default function JournalCard({ journal, onEdit, onDelete }: JournalCardProps) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const [isFav, setIsFav] = useState(journal.is_favorite)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const accent = journal.color ?? '#1976D2'
  const emojiBg = isDark ? `${accent}25` : getColorBg(accent)

  useEffect(() => {
    if (!menuOpen) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  async function handleFavToggle() {
    const prev = isFav
    setIsFav(!prev)
    const result = await toggleFavourite(journal.journal_id, prev)
    if ('error' in result) {
      setIsFav(prev)
      toast.error('Failed to update favourite')
    }
  }

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(journal.updated_at))

  return (
    <div
      className="relative bg-white dark:bg-[#1E1E1E] rounded-[14px] overflow-hidden cursor-pointer border border-[#E0E0E0] dark:border-[#3A3A3A] transition-transform hover:-translate-y-0.5"
      style={{
        boxShadow: isDark
          ? undefined
          : '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
      }}
      onClick={() => router.push(`/journals/${journal.journal_id}`)}
    >
      {/* Color strip */}
      <div className="h-1" style={{ background: accent }} />

      {/* Card body */}
      <div className="px-5 pt-5 pb-[18px]">
        {/* Top row */}
        <div className="flex items-start gap-3.5 mb-4">
          {/* Emoji bubble */}
          <div
            className="flex items-center justify-center w-[52px] h-[52px] rounded-[14px] text-2xl shrink-0"
            style={{ background: emojiBg }}
          >
            {journal.icon}
          </div>

          {/* Title + description */}
          <div className="flex-1 min-w-0 pt-1">
            <h3
              className="text-[15px] font-bold text-[#212121] dark:text-[#F5F5F5] truncate"
              style={{ letterSpacing: '-0.3px' }}
            >
              {journal.title}
            </h3>
            {journal.description && (
              <p className="text-xs text-[#9E9E9E] dark:text-[#757575] truncate mt-0.5">
                {journal.description}
              </p>
            )}
          </div>

          {/* More menu */}
          <div
            ref={menuRef}
            className="relative shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="p-1.5 rounded-lg hover:bg-[#EEEEEE] dark:hover:bg-[#2C2C2C] transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal size={16} className="text-[#9E9E9E] dark:text-[#757575]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-white dark:bg-[#1E1E1E] border border-[#E0E0E0] dark:border-[#3A3A3A] rounded-xl shadow-lg z-10 py-1">
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    handleFavToggle()
                  }}
                  className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-[#212121] dark:text-[#F5F5F5] hover:bg-[#FAFAFA] dark:hover:bg-[#2C2C2C] transition-colors"
                >
                  <Star
                    size={14}
                    className={isFav ? 'fill-[#1976D2] text-[#1976D2]' : 'text-[#9E9E9E]'}
                  />
                  {isFav ? 'Remove favourite' : 'Add to favourites'}
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onEdit()
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-[#212121] dark:text-[#F5F5F5] hover:bg-[#FAFAFA] dark:hover:bg-[#2C2C2C] transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    setMenuOpen(false)
                    onDelete()
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-[#FAFAFA] dark:hover:bg-[#2C2C2C] transition-colors"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer row */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold px-[10px] py-0.5 rounded-full"
            style={{ color: accent, background: emojiBg }}
          >
            {journal.entry_count} {journal.entry_count === 1 ? 'entry' : 'entries'}
          </span>
          <span className="flex items-center gap-1 text-xs text-[#9E9E9E] dark:text-[#757575]">
            <Calendar size={11} />
            {formattedDate}
          </span>
        </div>
      </div>
    </div>
  )
}
