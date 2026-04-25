'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Shield, Lock, BookOpen, FileText, Calendar } from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { lockVault, unhideJournal, unhideEntry } from '@/lib/actions/privacy'
import BookIcon from '@/components/ui/BookIcon'
import type { Database } from '@/types/supabase'

type Journal = Database['public']['Tables']['journals']['Row']
type Entry = Database['public']['Tables']['entries']['Row']

interface HiddenEntryRow extends Entry {
  journal_title: string
  journal_color: string
}

interface Props {
  journals: Journal[]
  entries: HiddenEntryRow[]
}

type Tab = 'journals' | 'entries'

function hexAlpha(hex: string, alpha: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${(parseInt(alpha, 16) / 255).toFixed(3)})`
}

export default function HiddenView({ journals, entries }: Props) {
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const [tab, setTab] = useState<Tab>('journals')
  const [pendingId, setPendingId] = useState<string | null>(null)

  const isDark = resolvedTheme === 'dark'

  async function handleLockVault() {
    await lockVault()
    router.refresh()
  }

  async function handleUnhideJournal(id: string) {
    setPendingId(id)
    const result = await unhideJournal(id)
    setPendingId(null)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Journal unhidden')
      router.refresh()
    }
  }

  async function handleUnhideEntry(id: string) {
    setPendingId(id)
    const result = await unhideEntry(id)
    setPendingId(null)
    if ('error' in result) {
      toast.error(result.error)
    } else {
      toast.success('Entry unhidden')
      router.refresh()
    }
  }

  const tabs: { value: Tab; label: string; count: number }[] = useMemo(
    () => [
      { value: 'journals', label: 'Journals', count: journals.length },
      { value: 'entries', label: 'Entries', count: entries.length },
    ],
    [journals.length, entries.length],
  )

  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Shield size={22} className="text-[#1976D2]" />
            <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Hidden</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-0.5">
            Private items — only visible while the vault is unlocked.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLockVault}
          title="Lock vault"
          aria-label="Lock vault"
          className="p-2 rounded-xl border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Lock size={16} />
        </button>
      </div>

      {/* Tab strip */}
      <div className="inline-flex p-0.5 bg-[var(--bg-muted)] border border-[var(--border)] rounded-xl mb-5">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-4 py-1.5 rounded-[10px] text-xs font-semibold transition-all ${
              tab === t.value
                ? 'bg-[var(--bg-surface)] text-[#1976D2] shadow-sm border border-[var(--border)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {tab === 'journals' && (
        journals.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="w-12 h-12" />}
            title="No hidden journals"
            body='Hide a journal from its menu ("Hide journal") and it will appear here.'
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {journals.map((j) => (
              <HiddenJournalCard
                key={j.journal_id}
                journal={j}
                isDark={isDark}
                disabled={pendingId === j.journal_id}
                onUnhide={() => handleUnhideJournal(j.journal_id)}
              />
            ))}
          </div>
        )
      )}

      {tab === 'entries' && (
        entries.length === 0 ? (
          <EmptyState
            icon={<FileText className="w-12 h-12" />}
            title="No hidden entries"
            body='Hide an entry from its card menu ("Hide entry") and it will appear here.'
          />
        ) : (
          <div className="flex flex-col gap-3">
            {entries.map((e) => (
              <HiddenEntryCard
                key={e.entry_id}
                entry={e}
                disabled={pendingId === e.entry_id}
                onUnhide={() => handleUnhideEntry(e.entry_id)}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="text-[#E0E0E0] dark:text-[#3A3A3A] mb-4">{icon}</div>
      <h2 className="text-lg font-medium text-[var(--text-secondary)] mb-1">{title}</h2>
      <p className="text-sm text-[var(--text-muted)] max-w-sm">{body}</p>
    </div>
  )
}

function HiddenJournalCard({
  journal,
  isDark,
  disabled,
  onUnhide,
}: {
  journal: Journal
  isDark: boolean
  disabled: boolean
  onUnhide: () => void
}) {
  const router = useRouter()
  const accent = journal.color ?? '#1976D2'
  const emojiBg = isDark ? hexAlpha(accent, '25') : hexAlpha(accent, '15')
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(journal.updated_at))

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/hidden/journals/${journal.journal_id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(`/hidden/journals/${journal.journal_id}`)
        }
      }}
      className="relative bg-[var(--bg-surface)] rounded-[14px] overflow-hidden border border-[var(--border)] cursor-pointer transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-[#1976D2] focus-visible:outline-none"
      style={{
        boxShadow: isDark
          ? undefined
          : '0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)',
      }}
    >
      <div className="h-1" style={{ background: accent }} />

      <div className="px-5 pt-5 pb-[18px]">
        <div className="flex items-start gap-3.5 mb-4">
          <div className="shrink-0 relative">
            <BookIcon color={accent} size={52} />
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-[var(--bg-surface)] border-2 border-[var(--border)] flex items-center justify-center">
              <Shield size={11} className="text-[#1976D2]" />
            </div>
          </div>

          <div className="flex-1 min-w-0 pt-1">
            <h3
              className="text-[15px] font-bold text-[var(--text-primary)] truncate"
              style={{ letterSpacing: '-0.3px' }}
            >
              {journal.title}
            </h3>
            {journal.description && (
              <p className="text-xs text-[var(--text-muted)] truncate mt-0.5">
                {journal.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span
              className="text-xs font-semibold px-[10px] py-0.5 rounded-full"
              style={{ color: accent, background: emojiBg }}
            >
              {journal.entry_count}{' '}
              {journal.entry_count === 1 ? 'entry' : 'entries'}
            </span>
            <span className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
              <Calendar size={11} />
              {formattedDate}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onUnhide()
            }}
            disabled={disabled}
            className="text-xs font-semibold text-[#1976D2] hover:underline disabled:opacity-50"
          >
            {disabled ? 'Unhiding…' : 'Unhide'}
          </button>
        </div>
      </div>
    </div>
  )
}

function HiddenEntryCard({
  entry,
  disabled,
  onUnhide,
}: {
  entry: HiddenEntryRow
  disabled: boolean
  onUnhide: () => void
}) {
  const router = useRouter()
  const accent = entry.journal_color || '#1976D2'
  const formattedDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${entry.entry_date}T00:00:00`))
  const readTime = Math.max(1, Math.ceil(entry.word_count / 200))
  const href = `/hidden/entries/${entry.entry_id}`

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(href)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(href)
        }
      }}
      className="relative flex items-stretch bg-[var(--bg-surface)] rounded-xl overflow-hidden border border-[var(--border)] cursor-pointer transition-transform hover:translate-x-0.5 focus-visible:ring-2 focus-visible:ring-[#1976D2] focus-visible:outline-none"
    >
      <div className="w-1 shrink-0" style={{ background: accent, opacity: 0.6 }} />

      <div className="flex-1 py-[18px] pl-[18px] pr-5">
        <div className="flex items-center gap-2 mb-1.5">
          <Shield size={12} className="text-[#1976D2] shrink-0" />
          <h3
            className="text-[15px] font-semibold text-[var(--text-primary)] truncate flex-1"
            style={{ letterSpacing: '-0.2px' }}
          >
            {entry.title || 'Untitled'}
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onUnhide()
            }}
            disabled={disabled}
            className="shrink-0 text-xs font-semibold text-[#1976D2] hover:underline disabled:opacity-50"
          >
            {disabled ? 'Unhiding…' : 'Unhide'}
          </button>
        </div>

        <div className="flex items-center gap-1 text-xs text-[var(--text-muted)]">
          <Calendar size={10} />
          <span>{formattedDate}</span>
          <span>·</span>
          <span>{entry.journal_title}</span>
          <span>·</span>
          <span>{readTime} min read</span>
        </div>
      </div>
    </div>
  )
}
