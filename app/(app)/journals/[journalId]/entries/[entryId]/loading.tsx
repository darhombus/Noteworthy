export default function EntryEditorLoading() {
  return (
    <div className="max-w-[820px] mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div className="h-8 w-32 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
        <div className="flex items-center gap-2">
          <div className="h-5 w-24 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
          <div className="h-8 w-8 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
        </div>
      </div>

      <div className="h-10 w-3/4 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse mb-3" />
      <div className="flex items-center gap-3 mb-6">
        <div className="h-6 w-32 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
        <div className="h-6 w-40 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
      </div>

      <div
        className="h-10 rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] mb-4 animate-pulse"
        aria-hidden="true"
      />

      <div className="rounded-lg border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] p-4">
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
          <div className="h-4 w-[92%] rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
          <div className="h-4 w-[85%] rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
          <div className="h-4 w-[60%] rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] animate-pulse" />
        </div>
      </div>
    </div>
  )
}
