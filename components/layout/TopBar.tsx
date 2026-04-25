'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, Plus, ChevronRight, Home, Search } from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'

// Static top-level routes. Anything not matched here is treated as a dynamic
// segment and resolved against the breadcrumb-title store (see BreadcrumbTitle).
const SECTION_LABELS: Record<string, string> = {
  dashboard:    'Dashboard',
  journals:     'Journals',
  analytics:    'Analytics',
  tags:         'Tags',
  hidden:       'Hidden',
  'recycle-bin':'Recycle Bin',
  settings:     'Settings',
}

// Segments under /hidden/... that are just grouping, not visitable pages.
// e.g. /hidden/journals/abc should render "Hidden > [journal]" — the
// "journals" segment here is a router grouping, not its own breadcrumb.
const HIDDEN_STRUCTURAL_SEGMENTS = new Set(['journals', 'entries'])

// Path segments that are structural grouping only (no crumb of their own).
// e.g. /journals/abc/entries/def renders "Journals > [journal] > [entry]" —
// "entries" is skipped since it's not a visitable page.
const STRUCTURAL_SEGMENTS = new Set(['entries'])

interface Crumb {
  label: string
  href: string | null  // null = current page, not clickable
}

function buildCrumbs(pathname: string, titles: Record<string, string>): Crumb[] {
  const parts = pathname.split('/').filter(Boolean)
  const crumbs: Crumb[] = []
  let href = ''
  const inHidden = parts[0] === 'hidden'

  for (let i = 0; i < parts.length; i++) {
    const segment = parts[i]
    href += `/${segment}`

    if (STRUCTURAL_SEGMENTS.has(segment)) continue
    // Under /hidden/**, the "journals" segment is just a grouping
    // (/hidden/journals doesn't exist as a page). Skip it so the
    // breadcrumb reads "Hidden > <journal>" instead of "Hidden > Journals > <journal>".
    if (inHidden && i > 0 && HIDDEN_STRUCTURAL_SEGMENTS.has(segment)) continue

    const sectionLabel = SECTION_LABELS[segment]
    const label = sectionLabel ?? titles[segment] ?? fallbackLabel(segment, parts, i)
    const isLast = i === parts.length - 1
    crumbs.push({ label, href: isLast ? null : href })
  }

  return crumbs
}

function fallbackLabel(segment: string, parts: string[], i: number): string {
  // `/journals/xxx/entries/new` — show "New Entry" rather than "new"
  if (segment === 'new' && parts[i - 1] === 'entries') return 'New Entry'
  // Dynamic id with no registered title yet (brief flash during navigation)
  if (parts[i - 1] === 'entries') return 'Entry'
  if (parts[i - 1] === 'journals') return 'Journal'
  return segment.charAt(0).toUpperCase() + segment.slice(1)
}

export default function TopBar() {
  const pathname = usePathname()
  const router = useRouter()
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const setCreateJournalOpen = useUIStore((s) => s.setCreateJournalOpen)
  const openSearch = useUIStore((s) => s.openSearch)
  const breadcrumbTitles = useUIStore((s) => s.breadcrumbTitles)

  const crumbs = buildCrumbs(pathname, breadcrumbTitles)

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

      {/* Breadcrumb trail */}
      <nav aria-label="Breadcrumb" className="flex items-center min-w-0 flex-1">
        <ol className="flex items-center gap-1 min-w-0 text-sm">
          <li className="flex items-center flex-shrink-0">
            <Link
              href="/dashboard"
              aria-label="Home"
              className="p-1 -m-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#EEEEEE] dark:hover:bg-[#2C2C2C] focus-visible:ring-2 focus-visible:ring-[#1976D2] focus-visible:outline-none transition-colors"
            >
              <Home size={14} />
            </Link>
          </li>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <li key={`${crumb.href ?? 'current'}-${i}`} className="flex items-center gap-1 min-w-0">
                <ChevronRight size={14} className="flex-shrink-0 text-[var(--text-secondary)]" />
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="px-1.5 py-0.5 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[#EEEEEE] dark:hover:bg-[#2C2C2C] focus-visible:ring-2 focus-visible:ring-[#1976D2] focus-visible:outline-none transition-colors truncate max-w-[180px]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    aria-current="page"
                    className="px-1.5 py-0.5 font-semibold text-gray-900 dark:text-white truncate max-w-[280px]"
                  >
                    {crumb.label}
                  </span>
                )}
              </li>
            )
          })}
        </ol>
      </nav>

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
