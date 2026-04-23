import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import LiveDataRefresh from '@/components/LiveDataRefresh'
import GreetingCard from '@/components/dashboard/GreetingCard'
import StatsCards from '@/components/dashboard/StatsCards'
import WeekActivity from '@/components/dashboard/WeekActivity'
import RecentEntries from '@/components/dashboard/RecentEntries'
import PromptOfTheDay from '@/components/dashboard/PromptOfTheDay'
import MotivationalQuote from '@/components/dashboard/MotivationalQuote'

// ---------------------------------------------------------------------------
// Streak calculation (inline — no separate utility)
// ---------------------------------------------------------------------------
function computeStreaks(sortedDesc: string[]): { current: number; best: number } {
  if (!sortedDesc.length) return { current: 0, best: 0 }

  // Deduplicate, keep DESC
  const unique = [...new Set(sortedDesc)].sort((a, b) => (a < b ? 1 : -1))

  const todayStr = new Date().toISOString().split('T')[0]
  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  const yesterdayStr = yest.toISOString().split('T')[0]

  // Current streak: starts from today or yesterday
  let current = 0
  if (unique[0] === todayStr || unique[0] === yesterdayStr) {
    current = 1
    for (let i = 1; i < unique.length; i++) {
      const a = new Date(unique[i - 1])
      const b = new Date(unique[i])
      if (Math.round((a.getTime() - b.getTime()) / 86_400_000) === 1) current++
      else break
    }
  }

  // Best streak: longest consecutive run across all dates
  let best = unique.length ? 1 : 0
  let run = 1
  for (let i = 1; i < unique.length; i++) {
    const a = new Date(unique[i - 1])
    const b = new Date(unique[i])
    if (Math.round((a.getTime() - b.getTime()) / 86_400_000) === 1) {
      run++
    } else {
      best = Math.max(best, run)
      run = 1
    }
  }
  best = Math.max(best, run)

  return { current, best }
}

// ---------------------------------------------------------------------------
// Current Sun–Sat week helpers
// ---------------------------------------------------------------------------
interface DaySlot {
  label: string
  date: string    // e.g. "Apr 6"
  dateStr: string // e.g. "2026-04-06"
}

function getCurrentWeekDays(): DaySlot[] {
  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay()) // back to Sunday
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

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const firstOfMonth = new Date()
  firstOfMonth.setDate(1)
  const firstOfMonthStr = firstOfMonth.toISOString().split('T')[0]

  // Run all fetches in parallel
  const [
    profileResult,
    totalCountResult,
    monthCountResult,
    allDatesResult,
    recentEntriesResult,
    topTagResult,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .single(),

    supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null),

    supabase
      .from('entries')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .gte('entry_date', firstOfMonthStr),

    // All entry dates + latest created_at for streak & week chart
    supabase
      .from('entries')
      .select('entry_date, created_at')
      .is('deleted_at', null)
      .order('entry_date', { ascending: false }),

    // Last 5 entries with journal metadata
    supabase
      .from('entries')
      .select('entry_id, title, entry_date, word_count, journal_id, journals(title, color)')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5),

    supabase
      .from('tags')
      .select('tag_name, usage_count')
      .eq('user_id', user.id)
      .order('usage_count', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // ---- Derived values ----
  const fullName = profileResult.data?.full_name ?? ''
  const totalEntries = totalCountResult.count ?? 0
  const thisMonth = monthCountResult.count ?? 0

  const allDates = (allDatesResult.data ?? []).map((e) => e.entry_date)
  const { current: currentStreak, best: bestStreak } = computeStreaks(allDates)

  // Most recent entry's created_at for the "last entry X ago" pill
  const lastEntryAt = allDatesResult.data?.[0]?.created_at ?? null

  // Week activity
  const weekDays = getCurrentWeekDays()
  const weekStart = weekDays[0].dateStr
  const weekEnd = weekDays[6].dateStr
  const weekDateCounts = new Map<string, number>()
  for (const row of allDatesResult.data ?? []) {
    if (row.entry_date >= weekStart && row.entry_date <= weekEnd) {
      weekDateCounts.set(row.entry_date, (weekDateCounts.get(row.entry_date) ?? 0) + 1)
    }
  }
  const thisWeek = [...weekDateCounts.values()].reduce((a, b) => a + b, 0)
  const weekActivityDays = weekDays.map((d) => ({
    label: d.label,
    date: d.date,
    count: weekDateCounts.get(d.dateStr) ?? 0,
  }))

  // Recent entries — journals join returns a single object (many-to-one FK)
  type RawEntry = {
    entry_id: string
    title: string | null
    entry_date: string
    word_count: number
    journal_id: string
    journals: { title: string; color: string } | { title: string; color: string }[] | null
  }
  const recentEntries = ((recentEntriesResult.data ?? []) as RawEntry[]).map((e) => {
    const journal = Array.isArray(e.journals) ? e.journals[0] : e.journals
    return {
      entryId: e.entry_id,
      title: e.title,
      entryDate: e.entry_date,
      wordCount: e.word_count,
      journalId: e.journal_id,
      journalTitle: journal?.title ?? 'Unknown',
      journalColor: journal?.color ?? '#1976D2',
    }
  })

  const topTag = topTagResult.data?.tag_name ?? null

  return (
    <div className="space-y-6 py-6">
      <LiveDataRefresh />
      <GreetingCard fullName={fullName} lastEntryAt={lastEntryAt} />

      <StatsCards
        totalEntries={totalEntries}
        thisMonth={thisMonth}
        thisWeek={thisWeek}
        currentStreak={currentStreak}
        bestStreak={bestStreak}
        topTag={topTag}
      />

      {/* 2/3 + 1/3 split: main content left, compact cards right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left — stacked main widgets */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <WeekActivity
            key={weekActivityDays.map((d) => d.count).join(',')}
            days={weekActivityDays}
          />
          <RecentEntries entries={recentEntries} />
        </div>

        {/* Right — compact cards */}
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
    </div>
  )
}
