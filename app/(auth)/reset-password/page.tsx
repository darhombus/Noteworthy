'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'
import { resetPasswordAction } from '@/lib/actions/auth'
import { resetPasswordSchema, type ResetPasswordFormData } from '@/lib/validations/auth'
import ThemeToggle from '@/components/layout/ThemeToggle'

export default function ResetPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  })

  const onSubmit = async (data: ResetPasswordFormData) => {
    setIsLoading(true)
    setServerError(null)
    const redirectTo = `${window.location.origin}/callback?next=/update-password`
    const result = await resetPasswordAction(data.email, redirectTo)
    if ('error' in result) {
      setServerError(result.error)
    } else {
      setSuccess(true)
    }
    setIsLoading(false)
  }

  return (
    <main className="min-h-screen bg-[#FAFAFA] dark:bg-[#121212] flex flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px] bg-white dark:bg-[#1E1E1E] rounded-2xl shadow-md border border-[#E0E0E0] dark:border-[#3A3A3A] px-10 py-10 flex flex-col items-center">

          {/* Logo */}
          <div className="w-16 h-16 rounded-2xl bg-[#1976D2] dark:bg-[#1976D2] flex items-center justify-center mb-3 shadow-lg shadow-[#1976D2]/20 dark:shadow-[#1976D2]/20">
            <BookOpen size={30} className="text-white" />
          </div>
          <span className="text-[17px] font-bold text-[#1976D2] dark:text-[#1976D2] mb-6 select-none">
            Noteworthy
          </span>

          <h1 className="text-[26px] font-semibold text-gray-900 dark:text-white tracking-tight text-center mb-1">
            Reset your password
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#9E9E9E] text-center mb-8">
            Enter your email and we&apos;ll send you a reset link
          </p>

          {success ? (
            <div className="w-full rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-4">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Check your email for a reset link
              </p>
              <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                The link expires in 1 hour.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4" noValidate>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-[#BDBDBD] mb-1.5">
                  Email address
                </label>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="Enter your email"
                  autoComplete="email"
                  className="w-full px-3.5 py-3 rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#2C2C2C] text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#1976D2] dark:focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] dark:focus:ring-[#1976D2] transition-colors"
                />
                {errors.email && (
                  <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              {serverError && (
                <p className="text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
                  {serverError}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 bg-[#1976D2] dark:bg-[#1976D2] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
              >
                {isLoading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}

          <p className="mt-7 text-sm text-gray-500 dark:text-[#9E9E9E]">
            Remember it?{' '}
            <Link href="/login" className="text-[#1976D2] dark:text-[#1976D2] font-semibold hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
