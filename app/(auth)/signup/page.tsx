'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { BookOpen, Eye, EyeOff } from 'lucide-react'
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
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
    mode: 'onTouched',
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
    <main className="relative min-h-screen bg-[var(--bg-page)] flex items-center justify-center px-4 py-6">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>

      <div className="w-full flex justify-center">
        <div className="w-full max-w-[420px] bg-[var(--bg-surface)] rounded-2xl shadow-md border border-[var(--border)] px-8 py-6 flex flex-col items-center">

          {/* Logo */}
          <div className="w-12 h-12 rounded-2xl bg-[#1976D2] dark:bg-[#1976D2] flex items-center justify-center mb-2 shadow-lg shadow-[#1976D2]/20 dark:shadow-[#1976D2]/20">
            <BookOpen size={22} className="text-white" />
          </div>
          <span className="text-[15px] font-bold text-[#1976D2] dark:text-[#1976D2] mb-3 select-none">
            Noteworthy
          </span>

          <h1 className="text-[22px] font-semibold text-gray-900 dark:text-white tracking-tight text-center mb-1">
            Create your account
          </h1>
          <p className="text-sm text-[var(--text-secondary)] text-center mb-4">
            Start your journaling journey today
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-3" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#BDBDBD] mb-1.5">
                Full Name
              </label>
              <input
                {...register('fullName')}
                type="text"
                placeholder="Your name"
                autoComplete="name"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#1976D2] dark:focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] dark:focus:ring-[#1976D2] transition-colors"
              />
              {errors.fullName && (
                <p className="mt-1.5 text-xs text-red-500">{errors.fullName.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#BDBDBD] mb-1.5">
                Email address
              </label>
              <input
                {...register('email')}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#1976D2] dark:focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] dark:focus:ring-[#1976D2] transition-colors"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#BDBDBD] mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Min. 8 characters"
                  autoComplete="new-password"
                  className="w-full px-3.5 py-2.5 pr-10 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#1976D2] dark:focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] dark:focus:ring-[#1976D2] transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--text-secondary)] hover:text-gray-700 dark:hover:text-white transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {password && strength && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-[#E0E0E0] dark:bg-[#333333] rounded-full overflow-hidden">
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
              className="w-full py-2.5 bg-[#1976D2] dark:bg-[#1976D2] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-1"
            >
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Already have an account?{' '}
            <Link href="/login" className="text-[#1976D2] dark:text-[#1976D2] font-semibold hover:underline">
              Log in
            </Link>
          </p>
        </div>
      </div>
    </main>
  )
}
