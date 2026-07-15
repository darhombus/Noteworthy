'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BookOpen } from 'lucide-react'
import { updatePasswordAction } from '@/lib/actions/auth'
import { updatePasswordSchema, type UpdatePasswordFormData } from '@/lib/validations/auth'

export default function UpdatePasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordFormData>({
    resolver: zodResolver(updatePasswordSchema),
  })

  const onSubmit = async (data: UpdatePasswordFormData) => {
    setIsLoading(true)
    setServerError(null)
    const result = await updatePasswordAction(data.password)
    if ('error' in result) {
      setServerError(result.error)
      setIsLoading(false)
    } else {
      toast.success('Password updated! Please log in.')
      router.push('/login')
    }
  }

  return (
    <main className="min-h-screen bg-[var(--bg-page)] flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px] bg-[var(--bg-surface)] rounded-2xl shadow-md border border-[var(--border)] px-10 py-10 flex flex-col items-center">

          {/* Logo */}
          <div className="w-16 h-16 rounded-2xl bg-[#1976D2] dark:bg-[#1976D2] flex items-center justify-center mb-3 shadow-lg shadow-[#1976D2]/20 dark:shadow-[#1976D2]/20">
            <BookOpen size={30} className="text-white" />
          </div>
          <span className="text-[17px] font-bold text-[#1976D2] dark:text-[#1976D2] mb-6 select-none">
            Noteworthy
          </span>

          <h1 className="text-[26px] font-semibold text-gray-900 dark:text-white tracking-tight text-center mb-1">
            Set new password
          </h1>
          <p className="text-sm text-[var(--text-secondary)] text-center mb-8">
            Choose a strong password for your account
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="w-full space-y-4" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-[#BDBDBD] mb-1.5">
                New password
              </label>
              <input
                {...register('password')}
                type="password"
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                className="w-full px-3.5 py-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#1976D2] dark:focus:border-[#1976D2] focus:ring-1 focus:ring-[#1976D2] dark:focus:ring-[#1976D2] transition-colors"
              />
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
              {isLoading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
