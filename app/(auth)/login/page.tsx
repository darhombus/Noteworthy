'use client'

import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { loginAction } from '@/lib/actions/auth'
import { loginSchema, type LoginFormData } from '@/lib/validations/auth'
import ThemeToggle from '@/components/layout/ThemeToggle'

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false },
  })

  const rememberMe = watch('rememberMe')

  useEffect(() => {
    if (!rememberMe) {
      const handleUnload = () => sessionStorage.setItem('nw_sign_out_on_load', '1')
      window.addEventListener('beforeunload', handleUnload)
      return () => window.removeEventListener('beforeunload', handleUnload)
    } else {
      sessionStorage.removeItem('nw_sign_out_on_load')
    }
  }, [rememberMe])

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setServerError(null)
    const result = await loginAction({ email: data.email, password: data.password })
    if (result?.error) {
      setServerError(result.error)
      setIsLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A] flex flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white dark:bg-[#1E293B] rounded-xl shadow-sm border border-[#E5E7EB] dark:border-slate-700 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome back
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-8">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-[#1A56DB] dark:text-[#6366F1] hover:underline">
              Sign up
            </Link>
          </p>

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

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-slate-300">
                  Password
                </label>
                <Link
                  href="/reset-password"
                  className="text-xs text-[#1A56DB] dark:text-[#6366F1] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                {...register('password')}
                type="password"
                placeholder="Your password"
                autoComplete="current-password"
                className="w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB] dark:focus:ring-[#6366F1]"
              />
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                {...register('rememberMe')}
                type="checkbox"
                id="rememberMe"
                className="w-4 h-4 rounded border-gray-300 text-[#1A56DB] focus:ring-[#1A56DB] dark:border-slate-600 dark:bg-slate-800 cursor-pointer"
              />
              <label
                htmlFor="rememberMe"
                className="text-sm text-gray-700 dark:text-slate-300 cursor-pointer select-none"
              >
                Remember me for 30 days
              </label>
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
              {isLoading ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
