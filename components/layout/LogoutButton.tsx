'use client'

import { LogOut } from 'lucide-react'
import { signOutAction } from '@/lib/actions/auth'

export default function LogoutButton() {
  return (
    <button
      onClick={() => signOutAction()}
      className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors w-full"
    >
      <LogOut size={16} />
      <span>Log out</span>
    </button>
  )
}
