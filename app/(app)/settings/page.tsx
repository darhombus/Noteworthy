import { createClient } from '@/lib/supabase/server'
import {
  STORAGE_QUOTA_BYTES,
  formatStorageSize,
  getUserStorageUsage,
} from '@/lib/storage/quota'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const currentUsage = user ? await getUserStorageUsage(user.id) : 0
  const limit = STORAGE_QUOTA_BYTES
  const percentUsed = Math.round((currentUsage / limit) * 1000) / 10

  const barColor =
    percentUsed > 90
      ? 'bg-red-500'
      : percentUsed > 70
        ? 'bg-yellow-500'
        : 'bg-green-500'

  const approaching = currentUsage > 0.8 * limit
  const almostFull = currentUsage > 0.95 * limit

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Settings</h1>

      <section className="rounded-xl shadow-sm border border-[#E0E0E0] dark:border-[#3A3A3A] bg-[var(--bg-surface)] p-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">
          Storage usage
        </h2>

        <div className="flex items-center justify-between text-sm text-[var(--text-secondary)] mb-2">
          <span>
            {formatStorageSize(currentUsage)} of {formatStorageSize(limit)} used
          </span>
          <span>{percentUsed}%</span>
        </div>

        <div className="h-2 w-full rounded-full bg-[var(--bg-muted)] overflow-hidden">
          <div
            className={`h-full ${barColor} transition-all`}
            style={{ width: `${Math.min(100, percentUsed)}%` }}
          />
        </div>

        {almostFull ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">
            You are almost out of storage. Delete existing media to continue uploading.
          </p>
        ) : approaching ? (
          <p className="mt-3 text-sm text-yellow-700 dark:text-yellow-400">
            You are approaching your storage limit. Consider deleting old media to free up
            space.
          </p>
        ) : null}
      </section>
    </div>
  )
}
