interface TagStat {
  name: string
  count: number
  color: string
}

interface TopTagsProps {
  tags: TagStat[]
}

export default function TopTags({ tags }: TopTagsProps) {
  if (tags.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-4 flex items-center justify-center min-h-[80px]">
        <p className="text-sm text-[#9E9E9E]">No tags yet.</p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-4 h-full">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Top Tags</h2>

      <div className="flex flex-col gap-2">
        {tags.map((tag, i) => (
          <div key={tag.name} className="flex items-center gap-2 min-w-0">
            {/* Rank */}
            <span className="text-xs font-medium text-[#9E9E9E] w-4 flex-shrink-0 text-right">
              {i + 1}
            </span>

            {/* Tag pill */}
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full truncate"
              style={{
                backgroundColor: tag.color + '22',
                color: tag.color,
                border: `1px solid ${tag.color}55`,
              }}
            >
              #{tag.name}
            </span>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Count */}
            <span className="text-xs font-bold text-gray-900 dark:text-white tabular-nums flex-shrink-0">
              {tag.count}
            </span>
            <span className="text-xs text-[#9E9E9E] flex-shrink-0">
              {tag.count === 1 ? 'use' : 'uses'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
