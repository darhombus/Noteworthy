export default function TagsLoading() {
  return (
    <div className="p-6 max-w-[900px] mx-auto">
      <div className="space-y-2 mb-6">
        <div className="h-8 w-24 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
        <div className="h-4 w-20 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="h-[64px] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] animate-pulse"
          />
        ))}
      </div>
    </div>
  )
}
