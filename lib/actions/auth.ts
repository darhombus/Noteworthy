'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signUpAction(data: {
  email: string
  password: string
  fullName: string
}): Promise<{ error: string } | undefined> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: data.email,
    password: data.password,
    options: {
      data: { full_name: data.fullName },
    },
  })

  if (error) return { error: error.message }

  // Profile row is created automatically via the fn_handle_new_user trigger
  redirect('/dashboard')
}

export async function loginAction(data: {
  email: string
  password: string
}): Promise<{ error: string } | undefined> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  })

  if (error) return { error: error.message }

  redirect('/dashboard')
}

export async function resetPasswordAction(
  email: string,
  redirectTo: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })

  if (error) return { error: error.message }

  return { success: true }
}

export async function updatePasswordAction(
  password: string
): Promise<{ error: string } | { success: true }> {
  const supabase = await createClient()

  const { error } = await supabase.auth.updateUser({ password })

  if (error) return { error: error.message }

  return { success: true }
}

export async function signOutAction(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}
