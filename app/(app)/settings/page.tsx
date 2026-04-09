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

  // Image vs video breakdown
  let imageUsage = 0
  let videoUsage = 0
  if (user) {
    const { data: breakdown } = await supabase
      .from('media')
      .select(
        'file_type, file_size, entries!inner(journal_id, journals!inner(user_id))',
      )
      .eq('entries.journals.user_id', user.id)

    if (breakdown) {
      for (const row of breakdown) {
        const size = Number(row.file_size ?? 0)
        if (row.file_type === 'video') {
          videoUsage += size
        } else {
          imageUsage += size
        }
      }
    }
  }

  // Warning thresholds: yellow at 80% (160 MB), red at 95% (190 MB)
  const approaching = currentUsage > 0.8 * limit
  const almostFull = currentUsage > 0.95 * limit

  const barColor = almostFull
    ? 'bg-red-500'
    : approaching
      ? 'bg-yellow-500'
      : 'bg-green-500'

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Settings</h1>

      <section className="rounded-xl shadow-sm border border-[#E0E0E0] dark:border-[#3A3A3A] bg-[var(--bg-surface)] p-5">
        <h2 className="text-base font-semibold text-[var(--text-primary)] mb-3">
          Storage usage
        </h2>

        {/* Total bar */}
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

        {/* Breakdown */}
        <div className="mt-3 flex gap-6 text-xs text-[var(--text-secondary)]">
          <span>
            Images:{' '}
            <span className="font-medium text-[var(--text-primary)]">
              {formatStorageSize(imageUsage)}
            </span>
          </span>
          <span>
            Videos:{' '}
            <span className="font-medium text-[var(--text-primary)]">
              {formatStorageSize(videoUsage)}
            </span>
          </span>
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
