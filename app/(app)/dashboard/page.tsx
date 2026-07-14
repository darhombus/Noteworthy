import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUser } from '@/lib/auth/server'
import { getPerfTraceId, timePerf } from '@/lib/perf/server'
import { withHotCache } from '@/lib/perf/hot-cache'
import GreetingCard from '@/components/dashboard/GreetingCard'
import StatsCards from '@/components/dashboard/StatsCards'
import WeekActivity from '@/components/dashboard/WeekActivity'
import RecentEntries from '@/components/dashboard/RecentEntries'
import PromptOfTheDay from '@/components/dashboard/PromptOfTheDay'
import MotivationalQuote from '@/components/dashboard/MotivationalQuote'

interface DaySlot {
  label: string
  date: string
  dateStr: string
}

interface DashboardRecentEntry {
  entryId: string
  title: string | null
  entryDate: string
  wordCount: number
  journalId: string
  journalTitle: string
  journalColor: string
}

interface DashboardSnapshotRow {
  total_entries: number
  this_month: number
  this_week: number
  current_streak: number
  best_streak: number
  top_tag: string | null
  week_counts: number[] | null
  recent_entries: unknown
}

function getCurrentWeekDays(): DaySlot[] {
  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const pad = (n: number) => String(n).padStart(2, '0')
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return {
      label: DAY_LABELS[i],
      date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      dateStr: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    }
  })
}

function DashboardOverviewFallback() {
  return (
    <div className="space-y-6">
      {/* GreetingCard — bg-[#1976D2] p-6, ~128px tall */}
      <div className="h-[128px] rounded-xl bg-[#1976D2]/70 animate-pulse" />

      {/* StatsCards — 6 cards in md:grid-cols-2 lg:grid-cols-3 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="h-[108px] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] bg-white dark:bg-[#1E1E1E] animate-pulse"
          />
        ))}
      </div>

      {/* Main grid: WeekActivity + RecentEntries (left col-span-2),
          PromptOfTheDay + MotivationalQuote (right col) */}
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
  )
}

async function DashboardOverview({
  userId,
  fullName,
  trace,
}: {
  userId: string
  fullName: string
  trace: string | null
}) {
  const supabase = await createClient()
  const snapshotResult = await timePerf(
    'page.dashboard.snapshot',
    async () =>
      await withHotCache(`dashboard:snapshot:${userId}`, 20_000, async () =>
        supabase.rpc('get_dashboard_snapshot'),
      ),
    { trace, userId },
  )
  if (snapshotResult.error) throw snapshotResult.error
  const snapshotRows = (snapshotResult.data ?? []) as DashboardSnapshotRow[]
  const snapshot = snapshotRows[0]
  if (!snapshot) throw new Error('Dashboard snapshot returned no rows')

  const weekDays = getCurrentWeekDays()
  const weekCounts = Array.isArray(snapshot.week_counts) ? snapshot.week_counts : []
  const weekActivityDays = weekDays.map((d, idx) => ({
    label: d.label,
    date: d.date,
    count: Number.isFinite(weekCounts[idx]) ? (weekCounts[idx] as number) : 0,
  }))

  const recentEntriesRaw = Array.isArray(snapshot.recent_entries)
    ? snapshot.recent_entries
    : []
  const recentEntries = recentEntriesRaw
    .filter((entry): entry is DashboardRecentEntry => {
      if (!entry || typeof entry !== 'object') return false
      const row = entry as Partial<DashboardRecentEntry>
      return (
        typeof row.entryId === 'string' &&
        typeof row.entryDate === 'string' &&
        typeof row.wordCount === 'number' &&
        typeof row.journalId === 'string' &&
        typeof row.journalTitle === 'string' &&
        typeof row.journalColor === 'string'
      )
    })
    .map((entry) => ({
      entryId: entry.entryId,
      title: entry.title ?? null,
      entryDate: entry.entryDate,
      wordCount: entry.wordCount,
      journalId: entry.journalId,
      journalTitle: entry.journalTitle,
      journalColor: entry.journalColor,
    }))

  return (
    <>
      <GreetingCard userId={userId} fullName={fullName} lastEntryAt={null} />

      <StatsCards
        totalEntries={snapshot.total_entries ?? 0}
        thisMonth={snapshot.this_month ?? 0}
        thisWeek={snapshot.this_week ?? 0}
        currentStreak={snapshot.current_streak ?? 0}
        bestStreak={snapshot.best_streak ?? 0}
        topTag={snapshot.top_tag ?? null}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-6">
          <WeekActivity key={weekActivityDays.map((d) => d.count).join(',')} days={weekActivityDays} />
          <RecentEntries entries={recentEntries} />
        </div>

        <div className="flex flex-col gap-6">
          <PromptOfTheDay />
          <Suspense
            fallback={
              <div className="bg-[#1976D2] rounded-xl p-4 min-h-[120px] animate-pulse" />
            }
          >
            <MotivationalQuote />
          </Suspense>
        </div>
      </div>
    </>
  )
}

export default async function DashboardPage() {
  const trace = await getPerfTraceId()
  return timePerf(
    'page.dashboard.total',
    async () => {
      const user = await getCurrentUser()
      if (!user) redirect('/login')

      const fullName =
        typeof user.fullName === 'string' && user.fullName.trim().length > 0
          ? user.fullName.trim()
          : 'User'

      return (
        <div className="space-y-6 py-6">
          <Suspense fallback={<DashboardOverviewFallback />}>
            <DashboardOverview userId={user.id} fullName={fullName} trace={trace} />
          </Suspense>
        </div>
      )
    },
    { trace },
  )
}
