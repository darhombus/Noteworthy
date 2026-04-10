'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useTransition } from 'react'
import {
  LayoutDashboard,
  BookOpen,
  BarChart2,
  Tag,
  Trash2,
  Settings,
  X,
  LogOut,
} from 'lucide-react'
import { useUIStore } from '@/store/useUIStore'
import ThemeToggle from './ThemeToggle'
import { signOutAction } from '@/lib/actions/auth'

export interface SidebarUser {
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
  { href: '/recycle-bin', label: 'Recycle Bin',  Icon: Trash2 },
  { href: '/settings',    label: 'Settings',     Icon: Settings },
]

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?'
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase()
}

export default function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [, startTransition] = useTransition()
  const { sidebarOpen, setSidebarOpen, profileName, profileAvatarUrl, setProfileName, setProfileAvatarUrl } = useUIStore()

  // Initialise Zustand profile state from server props on first mount
  useEffect(() => {
    setProfileName(user.fullName)
    setProfileAvatarUrl(user.avatarUrl)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // profileName starts as '' (uninitialized) — fall back to prop until mounted
  const displayName = profileName || user.fullName
  // profileAvatarUrl starts as null; we can't distinguish "no avatar" from "uninitialized"
  // so fall back to the server prop whenever the store still holds the initial empty name
  const displayAvatar = profileName ? profileAvatarUrl : user.avatarUrl

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
      <ul className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#1976D2] dark:focus-visible:ring-[#1976D2] focus-visible:outline-none ${
                  isActive
                    ? 'bg-[#1976D2] dark:bg-[#1E3A5F] text-white font-semibold'
                    : 'text-gray-600 dark:text-[#BDBDBD] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]'
                }`}
              >
                <Icon size={17} className="flex-shrink-0" />
                <span>{label}</span>
                {isActive && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
                )}
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
          <ul className="flex-1 px-1.5 lg:px-3 space-y-0.5">
            {NAV_ITEMS.map(({ href, label, Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <li key={href}>
                  <Link
                    href={href}
                    title={label}
                    className={`flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-xl text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#1976D2] dark:focus-visible:ring-[#1976D2] focus-visible:outline-none ${
                      isActive
                        ? 'bg-[#1976D2] dark:bg-[#1E3A5F] text-white font-semibold'
                        : 'text-gray-600 dark:text-[#BDBDBD] hover:bg-[#EEEEEE] dark:hover:bg-[#333333]'
                    }`}
                  >
                    <Icon size={17} className="flex-shrink-0" />
                    <span className="hidden lg:block">{label}</span>
                    {isActive && (
                      <div className="hidden lg:block ml-auto w-1.5 h-1.5 rounded-full bg-white/70 flex-shrink-0" />
                    )}
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
