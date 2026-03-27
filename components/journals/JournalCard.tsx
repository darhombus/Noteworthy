'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  Star,
  MoreHorizontal,
  Book,
  Heart,
  Briefcase,
  Globe,
  Music,
  Camera,
  Coffee,
  type LucideProps,
} from 'lucide-react'
import { toast } from 'sonner'
import { toggleFavourite } from '@/lib/actions/journals'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']

type IconName = 'book' | 'star' | 'heart' | 'briefcase' | 'globe' | 'music' | 'camera' | 'coffee'

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

interface JournalCardProps {
  journal: Journal
  onEdit: () => void
  onDelete: () => void
}

export default function JournalCard({ journal, onEdit, onDelete }: JournalCardProps) {
  const router = useRouter()
  const [isFav, setIsFav] = useState(journal.is_favorite)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

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

  async function handleFavToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    const prev = isFav
    setIsFav(!prev)
    const result = await toggleFavourite(journal.journal_id, prev)
    if ('error' in result) {
      setIsFav(prev)
      toast.error('Failed to update favourite')
    }
  }

  const IconComponent = ICON_MAP[journal.icon as IconName] ?? Book
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(journal.updated_at))

  return (
    <div
      className="relative bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-[#E5E7EB] dark:border-slate-700 border-l-4 cursor-pointer hover:shadow-md transition-shadow"
      style={{ borderLeftColor: journal.color }}
      onClick={() => router.push(`/journals/${journal.journal_id}`)}
    >
      <div className="pl-4 pr-3 py-4">
        <div className="flex items-start justify-between gap-2">
          {/* Icon + Title */}
          <div className="flex items-center gap-2 min-w-0">
            <IconComponent
              className="w-5 h-5 shrink-0"
              style={{ color: journal.color }}
            />
            <h3 className="font-semibold text-gray-900 dark:text-white truncate">
              {journal.title}
            </h3>
          </div>

          {/* Actions — stop propagation so card click doesn't fire */}
          <div
            className="flex items-center gap-0.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleFavToggle}
              className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
              aria-label={isFav ? 'Remove from favourites' : 'Add to favourites'}
            >
              <Star
                className={`w-4 h-4 transition-colors ${
                  isFav
                    ? 'fill-[var(--brand)] text-[var(--brand)]'
                    : 'text-gray-400 dark:text-slate-500'
                }`}
              />
            </button>

            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen((prev) => !prev)}
                className="p-1.5 rounded hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
                aria-label="More options"
              >
                <MoreHorizontal className="w-4 h-4 text-gray-400 dark:text-slate-500" />
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-slate-800 border border-[#E5E7EB] dark:border-slate-700 rounded-lg shadow-lg z-10 py-1">
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onEdit()
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false)
                      onDelete()
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {journal.description && (
          <p className="mt-1.5 text-sm text-gray-500 dark:text-slate-400 truncate">
            {journal.description}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2 text-xs text-gray-400 dark:text-slate-500">
          <span>
            {journal.entry_count} {journal.entry_count === 1 ? 'entry' : 'entries'}
          </span>
          <span>·</span>
          <span>Updated {formattedDate}</span>
        </div>
      </div>
    </div>
  )
}
