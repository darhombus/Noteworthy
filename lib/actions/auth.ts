'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'

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
  rememberMe?: boolean
}): Promise<{ error: string } | undefined> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: data.email,
    password: data.password,
  })

  if (error) return { error: error.message }

  // Always set nw_remember_me — the expiry controls "remember me" behavior.
  // rememberMe=true  → maxAge 30 days  → survives browser close
  // rememberMe=false → no maxAge       → session cookie, disappears when browser closes
  // proxy.ts forces re-login when this cookie is absent (browser was closed).
  const cookieStore = await cookies()
  const cookieOptions: Parameters<typeof cookieStore.set>[2] = {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    ...(data.rememberMe ? { maxAge: 60 * 60 * 24 * 30 } : {}),
  }
  cookieStore.set('nw_remember_me', '1', cookieOptions)

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

export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const cookieStore = await cookies()
  cookieStore.delete('nw_remember_me')
}
