'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { signUpAction } from '@/lib/actions/auth'
import { signupSchema, type SignupFormData } from '@/lib/validations/auth'
import ThemeToggle from '@/components/layout/ThemeToggle'

function getPasswordStrength(password: string): {
  label: 'Weak' | 'Medium' | 'Strong'
  color: string
  width: string
} {
  if (password.length < 8) return { label: 'Weak', color: 'bg-red-500', width: 'w-1/3' }
  const hasNumber = /\d/.test(password)
  const hasSpecial = /[^A-Za-z0-9]/.test(password)
  if (hasNumber && hasSpecial) return { label: 'Strong', color: 'bg-green-500', width: 'w-full' }
  return { label: 'Medium', color: 'bg-yellow-500', width: 'w-2/3' }
}

const strengthTextColor = {
  Weak: 'text-red-500',
  Medium: 'text-yellow-500',
  Strong: 'text-green-500',
}

export default function SignupPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  })

  const password = watch('password', '')
  const strength = password ? getPasswordStrength(password) : null

  const onSubmit = async (data: SignupFormData) => {
    setIsLoading(true)
    setServerError(null)
    const result = await signUpAction(data)
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
            Create your account
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-8">
            Already have an account?{' '}
            <Link href="/login" className="text-[#1A56DB] dark:text-[#6366F1] hover:underline">
              Log in
            </Link>
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Full Name
              </label>
              <input
                {...register('fullName')}
                type="text"
                placeholder="Jane Doe"
                autoComplete="name"
                className="w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB] dark:focus:ring-[#6366F1]"
              />
              {errors.fullName && (
                <p className="mt-1.5 text-xs text-red-500">{errors.fullName.message}</p>
              )}
            </div>

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
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <input
                {...register('password')}
                type="password"
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB] dark:focus:ring-[#6366F1]"
              />
              {password && strength && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${strength.color} ${strength.width}`}
                    />
                  </div>
                  <span className={`text-xs font-medium ${strengthTextColor[strength.label]}`}>
                    {strength.label}
                  </span>
                </div>
              )}
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-500">{errors.password.message}</p>
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
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
