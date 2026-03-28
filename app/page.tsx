import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import ThemeToggle from '@/components/layout/ThemeToggle'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[#FAFAFA] dark:bg-[#121212] flex flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center px-4">
        <div className="flex flex-col items-center text-center max-w-sm w-full">

          {/* Logo */}
          <div className="w-20 h-20 rounded-2xl bg-[#1976D2] flex items-center justify-center mb-4 shadow-xl shadow-[#1976D2]/25">
            <BookOpen size={38} className="text-white" />
          </div>

          {/* Brand name */}
          <h1 className="text-3xl font-bold text-[#1976D2] mb-3 tracking-tight">
            Noteworthy
          </h1>

          {/* Tagline */}
          <p className="text-gray-500 dark:text-[#9E9E9E] text-[15px] leading-relaxed mb-10">
            Your private space to think, reflect, and grow.
          </p>

          {/* CTAs */}
          <div className="flex flex-col gap-3 w-full">
            <Link
              href="/signup"
              className="w-full py-3 bg-[#1976D2] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="w-full py-3 border border-[#1976D2] text-[#1976D2] dark:border-[#1976D2] dark:text-[#1976D2] rounded-xl font-semibold text-sm hover:bg-blue-50 dark:hover:bg-[#2C2C2C]/50 transition-colors"
            >
              Log in
            </Link>
          </div>

        </div>
      </div>
    </main>
  )
}
