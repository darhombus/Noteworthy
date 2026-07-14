export default function SettingsLoading() {
  return (
    <div className="max-w-2xl space-y-6">
      <div className="h-8 w-32 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />

      <div className="flex gap-4 border-b border-[#E0E0E0] dark:border-[#3A3A3A]">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-10 w-24 rounded-t bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse"
          />
        ))}
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}
