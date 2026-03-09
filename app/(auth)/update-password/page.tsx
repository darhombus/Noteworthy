'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { updatePasswordAction } from '@/lib/actions/auth'
import { updatePasswordSchema, type UpdatePasswordFormData } from '@/lib/validations/auth'
import ThemeToggle from '@/components/layout/ThemeToggle'

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
    <main className="min-h-screen bg-[#F9FAFB] dark:bg-[#0F172A] flex flex-col">
      <header className="flex justify-end p-4">
        <ThemeToggle />
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md bg-white dark:bg-[#1E293B] rounded-xl shadow-sm border border-[#E5E7EB] dark:border-slate-700 p-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Set new password
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mb-8">
            Choose a strong password for your account.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1.5">
                New password
              </label>
              <input
                {...register('password')}
                type="password"
                placeholder="Min. 8 characters"
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-lg border border-[#E5E7EB] dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-900 dark:text-white text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1A56DB] dark:focus:ring-[#6366F1]"
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
              className="w-full py-2.5 bg-[#1A56DB] dark:bg-[#6366F1] text-white rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
