'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
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
    <main className="min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A] flex flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white dark:bg-[#1E293B] rounded-xl shadow-sm border border-[#E5E7EB] dark:border-slate-700 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Reset your password
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-8">
            Remember it?{' '}
            <Link href="/login" className="text-[#1A56DB] dark:text-[#6366F1] hover:underline">
              Log in
            </Link>
          </p>

          {success ? (
            <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 px-4 py-3">
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Check your email for a reset link
              </p>
              <p className="text-xs text-green-600 dark:text-green-500 mt-1">
                The link expires in 1 hour.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                  Email
                </label>
                <input
                  {...register('email')}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB] dark:focus:ring-[#6366F1]"
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
                className="w-full py-2.5 bg-[#1A56DB] dark:bg-[#6366F1] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
