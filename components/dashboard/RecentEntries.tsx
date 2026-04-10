import Link from 'next/link'

interface Entry {
  entryId: string
  title: string | null
  entryDate: string
  wordCount: number
  journalId: string
  journalTitle: string
  journalColor: string
}

interface RecentEntriesProps {
  entries: Entry[]
}

export default function RecentEntries({ entries }: RecentEntriesProps) {
  const base =
    'bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6'

  if (entries.length === 0) {
    return (
      <div className={base}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-4">
          Recent Entries
        </h2>
        <p className="text-sm text-[#757575] dark:text-[#9E9E9E]">
          No entries yet.{' '}
          <Link href="/journals" className="text-[#1976D2] hover:underline font-medium">
            Start writing!
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className={base}>
      <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">
        Recent Entries
      </h2>
      <ul className="divide-y divide-[#E0E0E0] dark:divide-[#3A3A3A]">
        {entries.map((entry) => (
          <li key={entry.entryId}>
            <Link
              href={`/journals/${entry.journalId}/entries/${entry.entryId}`}
              className="flex items-center gap-3 py-3 px-2 -mx-2 rounded-lg hover:bg-gray-50 dark:hover:bg-[#252525] transition-colors group"
            >
              {/* Journal colour dot */}
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.journalColor }}
              />

              {/* Text */}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#757575] dark:text-[#9E9E9E] truncate">
                  {entry.journalTitle}
                </p>
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate group-hover:text-[#1976D2] transition-colors">
                  {entry.title ?? 'Untitled'}
                </p>
              </div>

              {/* Meta */}
              <div className="flex-shrink-0 text-right">
                <p className="text-xs text-[#757575] dark:text-[#9E9E9E]">
                  {new Date(entry.entryDate).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </p>
                <p className="text-xs text-[#9E9E9E] dark:text-[#616161]">
                  {entry.wordCount.toLocaleString()} words
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
