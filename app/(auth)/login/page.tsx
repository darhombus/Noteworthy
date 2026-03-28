'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { Eye, EyeOff, BookOpen } from 'lucide-react'
import { loginAction } from '@/lib/actions/auth'
import { loginSchema, type LoginFormData } from '@/lib/validations/auth'
import ThemeToggle from '@/components/layout/ThemeToggle'

export default function LoginPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { rememberMe: false },
  })

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    setServerError(null)
    const result = await loginAction({ email: data.email, password: data.password, rememberMe: data.rememberMe })
    if (result?.error) {
      setServerError(result.error)
      setIsLoading(false)
    }
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

          {/* Heading */}
          <h1 className="text-[26px] font-semibold text-gray-900 dark:text-white tracking-tight text-center mb-1">
            Welcome back
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#9E9E9E] text-center mb-8">
            Sign in to continue your journaling journey
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4" noValidate>
            {/* Email */}
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

            {/* Password */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-medium text-gray-700 dark:text-[#BDBDBD]">
                  Password
                </label>
                <span
                  className="text-xs text-gray-400 dark:text-slate-500 cursor-not-allowed select-none"
                  title="Password reset coming soon"
                >
                  Forgot password?
                </span>
              </div>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full px-3.5 py-3 pr-11 rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#2C2C2C] text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#1976D2] dark:focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] dark:focus:ring-[#1976D2] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-[#BDBDBD] transition-colors"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                {...register('rememberMe')}
                type="checkbox"
                id="rememberMe"
                className="w-4 h-4 rounded border-gray-300 text-[#1976D2] focus:ring-[#1976D2] dark:border-[#3A3A3A] dark:bg-[#2C2C2C] cursor-pointer"
              />
              <label
                htmlFor="rememberMe"
                className="text-sm text-gray-600 dark:text-[#9E9E9E] cursor-pointer select-none"
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
              className="w-full py-3 bg-[#1976D2] dark:bg-[#1976D2] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? 'Logging in…' : 'Log in'}
            </button>
          </form>

          {/* Sign up link */}
          <p className="mt-7 text-sm text-gray-500 dark:text-[#9E9E9E]">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="text-[#1976D2] dark:text-[#1976D2] font-semibold hover:underline"
            >
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
