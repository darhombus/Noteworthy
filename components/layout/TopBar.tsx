'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Menu, Plus, ChevronRight, Home, Search } from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'

const TITLES: Record<string, string> = {
  '/dashboard':   'Dashboard',
  '/journals':    'Journals',
  '/tags':        'Tags',
  '/recycle-bin': 'Recycle Bin',
  '/settings':    'Settings',
}

function getTitle(pathname: string): string {
  for (const [prefix, label] of Object.entries(TITLES)) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return label
  }
  return 'Noteworthy'
}

export default function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { toggleSidebar, setCreateJournalOpen, openSearch } = useUIStore()

  const title = getTitle(pathname)

  function handleNewJournal() {
    setCreateJournalOpen(true)
    if (!pathname.startsWith('/journals')) {
      router.push('/journals')
    }
  }

  return (
    <header className="sticky top-0 z-20 bg-[var(--bg-surface)] border-b border-[var(--border)] flex items-center gap-3 px-4 py-3">
      {/* Hamburger — mobile only */}
      <button
        onClick={toggleSidebar}
        className="md:hidden p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[#EEEEEE] dark:hover:bg-[#2C2C2C] focus-visible:ring-2 focus-visible:ring-[#1976D2] focus-visible:outline-none"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Title + breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm text-[var(--text-secondary)]">
          <Home size={14} className="flex-shrink-0" />
          <ChevronRight size={14} className="flex-shrink-0" />
        </div>
        <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        <button
          onClick={openSearch}
          className="p-2 rounded-lg text-[var(--text-secondary)] hover:bg-[#EEEEEE] dark:hover:bg-[#2C2C2C] focus-visible:ring-2 focus-visible:ring-[#1976D2] focus-visible:outline-none"
          aria-label="Search (Ctrl+K)"
        >
          <Search size={18} />
        </button>
        <button
          onClick={handleNewJournal}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#1976D2] text-white text-sm font-semibold rounded-xl hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-[#1976D2] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <Plus size={15} />
          <span className="hidden sm:inline">New Journal</span>
        </button>
      </div>
    </header>
  )
}
