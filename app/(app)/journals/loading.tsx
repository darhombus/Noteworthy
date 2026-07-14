export default function JournalsLoading() {
  return (
    <div className="p-6 max-w-[1200px] mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="space-y-2">
          <div className="h-7 w-32 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
          <div className="h-4 w-20 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
        </div>
        <div className="h-9 w-48 rounded-lg bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-[120px] rounded-[14px] border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}
