'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { BookOpen } from 'lucide-react'
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
            Create your account
          </h1>
          <p className="text-sm text-gray-500 dark:text-[#9E9E9E] text-center mb-8">
            Start your journaling journey today
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#BDBDBD] mb-1.5">
                Full Name
              </label>
              <input
                {...register('fullName')}
                type="text"
                placeholder="Jane Doe"
                autoComplete="name"
                className="w-full px-3.5 py-3 rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#2C2C2C] text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#1976D2] dark:focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] dark:focus:ring-[#1976D2] transition-colors"
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
                className="w-full px-3.5 py-3 rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#2C2C2C] text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#1976D2] dark:focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] dark:focus:ring-[#1976D2] transition-colors"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-500">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#BDBDBD] mb-1.5">
                Password
              </label>
              <input
                {...register('password')}
                type="password"
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                className="w-full px-3.5 py-3 rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#2C2C2C] text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#1976D2] dark:focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] dark:focus:ring-[#1976D2] transition-colors"
              />
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
              className="w-full py-3 bg-[#1976D2] dark:bg-[#1976D2] text-white rounded-xl font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-7 text-sm text-gray-500 dark:text-[#9E9E9E]">
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
