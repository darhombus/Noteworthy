'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useTransition } from 'react'
import {
  LayoutDashboard,
  BookOpen,
  BarChart2,
  Tag,
  Trash2,
  Settings,
  Lock,
  X,
  LogOut,
} from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'
import ThemeToggle from './ThemeToggle'
import { signOutAction } from '@/lib/actions/auth'
import { createClient } from '@/lib/supabase/client'

export interface SidebarUser {
  id: string
  fullName: string
  email: string
  avatarUrl: string | null
}

interface SidebarProps {
  user: SidebarUser
}

const NAV_ITEMS = [
  { href: '/dashboard',   label: 'Dashboard',   Icon: LayoutDashboard },
  { href: '/journals',    label: 'Journals',     Icon: BookOpen },
  { href: '/analytics',   label: 'Analytics',   Icon: BarChart2 },
  { href: '/tags',        label: 'Tags',         Icon: Tag },
  { href: '/hidden',      label: 'Hidden',       Icon: Lock },
  { href: '/recycle-bin', label: 'Recycle Bin',  Icon: Trash2 },
  { href: '/settings',    label: 'Settings',     Icon: Settings },
] as const

const HEAVY_ROUTE_PREFETCH = ['/analytics', '/tags', '/hidden'] as const

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const prefetchedRoutesRef = useRef<Set<string>>(new Set())
  const {
    sidebarOpen,
    setSidebarOpen,
    profileUserId,
    profileName,
    profileAvatarUrl,
    setProfile,
    clearProfile,
  } = useUIStore()

  const prefetchRoute = useCallback((href: string) => {
    if (prefetchedRoutesRef.current.has(href)) return
    prefetchedRoutesRef.current.add(href)
    router.prefetch(href)
  }, [router])

  // Warm likely-heavy destinations shortly after mount/route changes so
  // click navigation doesn't need to cold-fetch these pages.
  useEffect(() => {
    const id = window.setTimeout(() => {
      for (const href of HEAVY_ROUTE_PREFETCH) {
        const isCurrent = pathname === href || pathname.startsWith(`${href}/`)
        if (!isCurrent) prefetchRoute(href)
      }
    }, 250)
    return () => window.clearTimeout(id)
  }, [pathname, prefetchRoute])

  // Reset profile snapshot on user/context change so no stale value can flash.
  useEffect(() => {
    clearProfile()
  }, [clearProfile, user.id])

  // Hydrate profile details client-side so route navigation is not blocked by
  // a server-side layout profile query on every page transition.
  useEffect(() => {
    let cancelled = false

    async function hydrateProfile() {
      const supabase = createClient()
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled || !data) return

      const hydratedName =
        typeof data.full_name === 'string' && data.full_name.trim().length > 0
          ? data.full_name
          : ''

      setProfile({
        userId: user.id,
        name: hydratedName,
        avatarUrl: data.avatar_url ?? null,
      })
    }

    void hydrateProfile()

    return () => {
      cancelled = true
    }
  }, [setProfile, user.id])

  const hasHydratedProfile = profileUserId === user.id
  const displayName = hasHydratedProfile && profileName ? profileName : 'User'
  const displayAvatar = hasHydratedProfile ? profileAvatarUrl : null

  function handleSignOut() {
    startTransition(async () => {
      await signOutAction()
      router.push('/')
    })
  }

  // Close drawer on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname, setSidebarOpen])

  // Close drawer when resizing to desktop (≥768px) so stale open state doesn't
  // cause the mobile drawer to reappear if the user later shrinks the window again.
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth >= 768) {
        setSidebarOpen(false)
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [setSidebarOpen])

  const initials = getInitials(displayName)

  const navContent = (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 flex items-center justify-between border-b border-[var(--border)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#1976D2] dark:bg-[#1976D2] flex items-center justify-center flex-shrink-0">
            <BookOpen size={15} className="text-white" />
          </div>
          <span className="text-[16px] font-bold text-[#1976D2] dark:text-[#1976D2] leading-none select-none">
            Noteworthy
          </span>
        </div>
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-[#EEEEEE] dark:hover:bg-[#333333] focus-visible:ring-2 focus-visible:ring-[#1976D2] dark:focus-visible:ring-[#1976D2] focus-visible:outline-none"
          aria-label="Close menu"
        >
          <X size={18} />
        </button>
      </div>

      {/* Nav links */}
      <ul className="flex-1 px-3 pt-2 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const { href, label, Icon } = item
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                onMouseEnter={() => prefetchRoute(href)}
                onFocus={() => prefetchRoute(href)}
                onTouchStart={() => prefetchRoute(href)}
                className={`relative flex items-center gap-3 px-3 py-2.5 pr-8 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#1976D2] dark:focus-visible:ring-[#1976D2] focus-visible:outline-none ${
                  isActive
                    ? 'sidebar-nav-active bg-[#1976D2] dark:bg-[#1E3A5F] text-white font-semibold'
                    : 'text-gray-600 dark:text-[#BDBDBD] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]'
                }`}
              >
                <Icon size={17} className="flex-shrink-0" />
                <span>{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Bottom: user + theme + logout */}
      <div className="px-3 pb-4 border-t border-[var(--border)] pt-3 space-y-1">
        {/* User info */}
        <div className="flex items-center gap-3 px-2 py-2">
          {displayAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={displayAvatar}
              alt={displayName}
              className="w-9 h-9 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-[#1976D2] dark:bg-[#1976D2] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              {displayName}
            </p>
            <p className="text-xs text-[var(--text-secondary)] truncate">{user.email}</p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            title="Log out"
            className="p-1.5 rounded-lg text-gray-400 dark:text-[#616161] hover:text-gray-600 dark:hover:text-slate-300 hover:bg-[#EEEEEE] dark:hover:bg-[#333333] transition-colors focus-visible:ring-2 focus-visible:ring-[#1976D2] dark:focus-visible:ring-[#1976D2] focus-visible:outline-none flex-shrink-0"
          >
            <LogOut size={15} />
          </button>
        </div>

        {/* Theme toggle */}
        <div className="flex items-center gap-3 px-2 py-1">
          <ThemeToggle />
          <span className="text-sm text-[var(--text-secondary)]">Theme</span>
        </div>
      </div>
    </nav>
  )

  return (
    <>
      {/* Desktop sidebar: 240px on lg+, 60px (icon-only) on md */}
      <aside className="hidden md:flex flex-col flex-shrink-0 w-[60px] lg:w-[240px] bg-[var(--bg-muted)] border-r border-[var(--border)] h-screen sticky top-0 overflow-y-auto">
        <nav className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-2 lg:px-4 py-5 flex items-center border-b border-[var(--border)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-[#1976D2] dark:bg-[#1976D2] flex items-center justify-center flex-shrink-0">
                <BookOpen size={15} className="text-white" />
              </div>
              <span className="hidden lg:block text-[16px] font-bold text-[#1976D2] dark:text-[#1976D2] leading-none select-none truncate">
                Noteworthy
              </span>
            </div>
          </div>

          {/* Nav links */}
          <ul className="flex-1 px-1.5 lg:px-3 pt-2 space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const { href, label, Icon } = item
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onMouseEnter={() => prefetchRoute(href)}
                    onFocus={() => prefetchRoute(href)}
                    onTouchStart={() => prefetchRoute(href)}
                    title={label}
                    className={`relative flex items-center gap-3 px-2 lg:px-3 lg:pr-8 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#1976D2] dark:focus-visible:ring-[#1976D2] focus-visible:outline-none ${
                      isActive
                        ? 'sidebar-nav-active bg-[#1976D2] dark:bg-[#1E3A5F] text-white font-semibold'
                        : 'text-gray-600 dark:text-[#BDBDBD] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]'
                    }`}
                  >
                    <Icon size={17} className="flex-shrink-0" />
                    <span className="hidden lg:block">{label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* Bottom */}
          <div className="px-1.5 lg:px-3 pb-4 border-t border-[var(--border)] pt-3 space-y-1">
            {/* User */}
            <div className="flex items-center gap-3 px-1 lg:px-2 py-2">
              {displayAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={displayAvatar}
                  alt={displayName}
                  className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-full bg-[#1976D2] dark:bg-[#1976D2] text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                  {initials}
                </div>
              )}
              <div className="hidden lg:block min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {displayName}
                </p>
                <p className="text-xs text-[var(--text-secondary)] truncate">{user.email}</p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                title="Log out"
                className="hidden lg:block flex-shrink-0 p-1.5 rounded-lg text-gray-400 dark:text-[#616161] hover:text-gray-600 dark:hover:text-slate-300 hover:bg-[#EEEEEE] dark:hover:bg-[#333333] transition-colors focus-visible:ring-2 focus-visible:ring-[#1976D2] dark:focus-visible:ring-[#1976D2] focus-visible:outline-none"
              >
                <LogOut size={15} />
              </button>
            </div>

            {/* Theme */}
            <div className="flex items-center gap-3 px-1 lg:px-2 py-1">
              <ThemeToggle />
              <span className="hidden lg:block text-sm text-[var(--text-secondary)]">Theme</span>
            </div>

            {/* Log out icon-only on md */}
            <button
              type="button"
              onClick={handleSignOut}
              title="Log out"
              className="lg:hidden w-full flex justify-center p-2 rounded-xl text-gray-400 dark:text-[#616161] hover:text-gray-600 dark:hover:text-slate-300 hover:bg-[#EEEEEE] dark:hover:bg-[#333333] transition-colors focus-visible:ring-2 focus-visible:ring-[#1976D2] dark:focus-visible:ring-[#1976D2] focus-visible:outline-none"
            >
              <LogOut size={17} />
            </button>
          </div>
        </nav>
      </aside>

      {/* Mobile drawer */}
      <>
        {/* Backdrop */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/40 md:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-hidden="true"
          />
        )}
        {/* Drawer panel */}
        <div
          className={`fixed inset-y-0 left-0 z-40 w-[240px] bg-[var(--bg-muted)] border-r border-[var(--border)] transform transition-transform duration-200 ease-in-out md:hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {navContent}
        </div>
      </>
    </>
  )
}
