import { createBrowserClient } from '@supabase/ssr'

function getSupabasePublicKey() {
  // Prefer modern publishable keys. Fall back to legacy anon keys so
  // existing environments keep working during migration.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!key) {
    throw new Error(
      'Missing Supabase key: set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (preferred) or NEXT_PUBLIC_SUPABASE_ANON_KEY',
    )
  }

  return key
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    getSupabasePublicKey(),
  )
}
