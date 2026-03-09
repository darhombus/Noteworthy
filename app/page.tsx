import Link from 'next/link'
import ThemeToggle from '@/components/layout/ThemeToggle'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white dark:bg-[#0F172A] flex flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        <h1 className="text-[32px] font-bold text-[#1A56DB] dark:text-[#6366F1]">
          Noteworthy
        </h1>
        <p className="text-gray-600 dark:text-slate-400 text-center">
          Your private space to think, reflect, and grow.
        </p>
        <div className="flex gap-3">
          <Link
            href="/signup"
            className="px-6 py-2.5 bg-[#1A56DB] dark:bg-[#6366F1] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Sign Up
          </Link>
          <Link
            href="/login"
            className="px-6 py-2.5 border border-[#1A56DB] dark:border-[#6366F1] text-[#1A56DB] dark:text-[#6366F1] rounded-lg font-medium text-sm hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
          >
            Log In
          </Link>
        </div>
      </div>
    </main>
  )
}
