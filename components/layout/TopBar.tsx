'use client'

import { usePathname, useRouter } from 'next/navigation'
import { Menu, Search, PenSquare, ChevronRight, Home } from 'lucide-react'
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
  const { toggleSidebar } = useUIStore()

  const title = getTitle(pathname)

  return (
    <header className="sticky top-0 z-20 bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 flex items-center gap-3 px-4 py-3">
      {/* Hamburger — mobile only */}
      <button
        onClick={toggleSidebar}
        className="md:hidden p-2 rounded-lg text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-[#1A56DB] dark:focus-visible:ring-[#6366F1] focus-visible:outline-none"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Title + breadcrumb */}
      <div className="flex items-center gap-1.5 min-w-0 flex-1">
        <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-slate-400">
          <Home size={14} className="flex-shrink-0" />
          <ChevronRight size={14} className="flex-shrink-0" />
        </div>
        <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2">
        {/* Search */}
        <div className="relative group">
          <button
            className="p-2 rounded-lg border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors focus-visible:ring-2 focus-visible:ring-[#1A56DB] dark:focus-visible:ring-[#6366F1] focus-visible:outline-none"
            aria-label="Search (Cmd+K)"
          >
            <Search size={18} />
          </button>
          {/* Tooltip */}
          <span className="pointer-events-none absolute right-0 top-full mt-1.5 whitespace-nowrap rounded-lg bg-gray-900 dark:bg-slate-700 text-white text-xs px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Search <kbd className="font-mono">⌘K</kbd>
          </span>
        </div>

        {/* New Entry */}
        <button
          onClick={() => router.push('/journals')}
          className="flex items-center gap-1.5 px-3 py-2 bg-[#1A56DB] dark:bg-[#6366F1] text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity focus-visible:ring-2 focus-visible:ring-[#1A56DB] dark:focus-visible:ring-[#6366F1] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <PenSquare size={15} />
          <span className="hidden sm:inline">New Entry</span>
        </button>
      </div>
    </header>
  )
}
