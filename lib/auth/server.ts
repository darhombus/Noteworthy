import { cache } from 'react'
import { headers } from 'next/headers'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getPerfTraceId, timePerf } from '@/lib/perf/server'
import { withHotCache } from '@/lib/perf/hot-cache'

const NW_USER_ID_HEADER = 'x-nw-user-id'
const NW_USER_EMAIL_HEADER = 'x-nw-user-email'
const NW_USER_FULL_NAME_HEADER = 'x-nw-user-full-name'
const PROFILE_HOT_TTL_MS = 15000
// Vault secret TYPE (pin | password | null) is stable per user — it only
// changes when the user explicitly sets, changes, or removes their vault
// secret, and each of those write actions now clears this key. Keeping
// it cached for longer than the full profile (which can change with
// display-name / avatar / preferences edits) is safe and avoids the
// 230-440ms Supabase round-trip on every /hidden cold visit.
const VAULT_SECRET_TYPE_HOT_TTL_MS = 30000

export function getProfileCacheTag(userId: string): string {
  return `profile:${userId}`
}

async function fetchProfileByUserId(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, preferences, vault_secret_type, vault_auto_lock_minutes')
    .eq('user_id', userId)
    .single()
  return data ?? null
}

export interface ProxyValidatedUser {
  id: string
  email: string | null
  fullName: string | null
}

export const getCurrentUserId = cache(async (): Promise<string | null> => {
  const h = await headers()
  const id = h.get(NW_USER_ID_HEADER)
  if (id) return id
  const user = await getCurrentUser()
  return user?.id ?? null
})

export const getCurrentUser = cache(async (): Promise<ProxyValidatedUser | null> => {
  const trace = await getPerfTraceId()
  return timePerf(
    'auth.getCurrentUser.total',
    async () => {
      const h = await headers()
      const id = h.get(NW_USER_ID_HEADER)
      if (id) {
        return {
          id,
          email: h.get(NW_USER_EMAIL_HEADER),
          fullName: h.get(NW_USER_FULL_NAME_HEADER),
        }
      }

      const supabase = await createClient()

      const user = await timePerf(
        'auth.getCurrentUser.getUser',
        async () => {
          const {
            data: { user },
          } = await supabase.auth.getUser()
          return user
        },
        { trace },
      )

      if (!user) return null
      return {
        id: user.id,
        email: user.email ?? null,
        fullName:
          user.user_metadata &&
          typeof user.user_metadata === 'object' &&
          typeof (user.user_metadata as { full_name?: unknown }).full_name === 'string'
            ? ((user.user_metadata as { full_name?: string }).full_name ?? null)
            : null,
      }
    },
    { trace },
  )
})

export const getCurrentFullUser = cache(async (): Promise<User | null> => {
  const trace = await getPerfTraceId()
  return timePerf(
    'auth.getCurrentFullUser',
    async () => {
      const supabase = await createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      return user
    },
    { trace },
  )
})

export const getCurrentProfile = cache(async () => {
  const trace = await getPerfTraceId()
  return timePerf(
    'auth.getCurrentProfile',
    async () => {
      const user = await getCurrentUser()
      if (!user) return null
      return withHotCache(`profile:full:${user.id}`, PROFILE_HOT_TTL_MS, () =>
        fetchProfileByUserId(user.id),
      )
    },
    { trace },
  )
})

export const getCurrentVaultSecretType = cache(async (): Promise<'pin' | 'password' | null> => {
  const trace = await getPerfTraceId()
  return timePerf(
    'auth.getCurrentVaultSecretType',
    async () => {
      const user = await getCurrentUser()
      if (!user) return null
      const secretType = await withHotCache(
        `profile:secret-type:${user.id}`,
        VAULT_SECRET_TYPE_HOT_TTL_MS,
        async () => {
          const supabase = await createClient()
          const { data } = await supabase
            .from('profiles')
            .select('vault_secret_type')
            .eq('user_id', user.id)
            .maybeSingle()
          return data?.vault_secret_type ?? null
        },
      )
      return secretType === 'pin' || secretType === 'password' ? secretType : null
    },
    { trace },
  )
})
