'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import {
  LayoutDashboard,
  BookOpen,
  Tag,
  Trash2,
  Settings,
  X,
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
  const { sidebarOpen, setSidebarOpen } = useUIStore()

  // Close drawer on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname, setSidebarOpen])

  const initials = getInitials(user.fullName)

  const navContent = (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-5 flex items-center justify-between">
        <span className="text-[18px] font-bold text-[#1A56DB] dark:text-[#6366F1] leading-none select-none">
          Noteworthy
        </span>
        {/* Close button — mobile only */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700 focus-visible:ring-2 focus-visible:ring-[#1A56DB] dark:focus-visible:ring-[#6366F1] focus-visible:outline-none"
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
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#1A56DB] dark:focus-visible:ring-[#6366F1] focus-visible:outline-none ${
                  isActive
                    ? 'bg-[#1A56DB]/10 dark:bg-[#6366F1]/15 text-[#1A56DB] dark:text-[#6366F1] font-semibold'
                    : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon size={18} className="flex-shrink-0" />
                {/* Label hidden on md collapsed, visible on lg+ and in mobile drawer */}
                <span className="hidden lg:block md-sidebar-label">{label}</span>
                {/* Always visible in mobile drawer */}
                <span className="block lg:hidden">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Bottom: user + theme + logout */}
      <div className="px-3 pb-4 space-y-2 border-t border-gray-200 dark:border-slate-700 pt-3">
        {/* User info */}
        <div className="flex items-center gap-3 px-2 py-2">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt={user.fullName}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-[#1A56DB] dark:bg-[#6366F1] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
              {initials}
            </div>
          )}
          <div className="hidden lg:block min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {user.fullName}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user.email}</p>
          </div>
          {/* Mobile drawer: show name */}
          <div className="block lg:hidden min-w-0">
            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
              {user.fullName}
            </p>
            <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user.email}</p>
          </div>
        </div>

        {/* Theme toggle */}
        <div className="flex items-center gap-3 px-2">
          <ThemeToggle />
          <span className="hidden lg:block text-sm text-gray-600 dark:text-slate-400">Theme</span>
          <span className="block lg:hidden text-sm text-gray-600 dark:text-slate-400">Theme</span>
        </div>

        {/* Log out */}
        <form action={signOutAction}>
          <button
            type="submit"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-[#1A56DB] dark:focus-visible:ring-[#6366F1] focus-visible:outline-none"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="flex-shrink-0"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className="hidden lg:block">Log out</span>
            <span className="block lg:hidden">Log out</span>
          </button>
        </form>
      </div>
    </nav>
  )

  return (
    <>
      {/* Desktop sidebar: 240px on lg+, 60px (icon-only) on md */}
      <aside className="hidden md:flex flex-col flex-shrink-0 w-[60px] lg:w-[240px] bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 h-screen sticky top-0 overflow-y-auto">
        <nav className="flex flex-col h-full">
          {/* Logo */}
          <div className="px-2 lg:px-5 py-5 flex items-center">
            <span className="hidden lg:block text-[18px] font-bold text-[#1A56DB] dark:text-[#6366F1] leading-none select-none">
              Noteworthy
            </span>
            {/* Icon-only: show a small brand dot on md */}
            <div className="block lg:hidden w-7 h-7 rounded-lg bg-[#1A56DB] dark:bg-[#6366F1] flex items-center justify-center">
              <span className="text-white text-xs font-bold">N</span>
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
                    className={`flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-lg text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#1A56DB] dark:focus-visible:ring-[#6366F1] focus-visible:outline-none ${
                      isActive
                        ? 'bg-[#1A56DB]/10 dark:bg-[#6366F1]/15 text-[#1A56DB] dark:text-[#6366F1] font-semibold'
                        : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Icon size={18} className="flex-shrink-0" />
                    <span className="hidden lg:block">{label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>

          {/* Bottom */}
          <div className="px-1.5 lg:px-3 pb-4 space-y-2 border-t border-gray-200 dark:border-slate-700 pt-3">
            {/* User */}
            <div className="flex items-center gap-3 px-1 lg:px-2 py-2">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#1A56DB] dark:bg-[#6366F1] text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {initials}
                </div>
              )}
              <div className="hidden lg:block min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {user.fullName}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{user.email}</p>
              </div>
            </div>

            {/* Theme */}
            <div className="flex items-center gap-3 px-1 lg:px-2">
              <ThemeToggle />
              <span className="hidden lg:block text-sm text-gray-600 dark:text-slate-400">Theme</span>
            </div>

            {/* Log out */}
            <form action={signOutAction}>
              <button
                type="submit"
                title="Log out"
                className="w-full flex items-center gap-3 px-2 lg:px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors focus-visible:ring-2 focus-visible:ring-[#1A56DB] dark:focus-visible:ring-[#6366F1] focus-visible:outline-none"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="flex-shrink-0"
                  aria-hidden="true"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                <span className="hidden lg:block">Log out</span>
              </button>
            </form>
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
          className={`fixed inset-y-0 left-0 z-40 w-[240px] bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 transform transition-transform duration-200 ease-in-out md:hidden ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {navContent}
        </div>
      </>
    </>
  )
}
