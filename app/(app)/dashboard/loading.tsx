// Mirrors DashboardOverviewFallback inside dashboard/page.tsx exactly so the
// segment loading → Suspense fallback handoff is invisible. Any change here
// must be mirrored there (and vice versa) — or the user sees a layout shift
// during navigation. Real components: GreetingCard, StatsCards (6 cards in
// lg:grid-cols-3), WeekActivity + RecentEntries (left col-span-2),
// PromptOfTheDay + MotivationalQuote (right col).
export default function DashboardLoading() {
  return (
    <div className="space-y-6 py-6">
      <div className="space-y-6">
        <div className="h-[128px] rounded-xl bg-[#1976D2]/70 animate-pulse" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div
              key={i}
              className="h-[108px] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] animate-pulse"
            />
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 flex flex-col gap-6">
            <div className="h-[260px] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] animate-pulse" />
            <div className="h-[300px] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] animate-pulse" />
          </div>
          <div className="flex flex-col gap-6">
            <div className="h-[180px] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] animate-pulse" />
            <div className="h-[200px] rounded-xl bg-[#1976D2]/70 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  )
}
