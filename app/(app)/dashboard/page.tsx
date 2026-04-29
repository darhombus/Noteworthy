import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { publicScope } from '@/lib/data/scope'
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

  // The dashboard is a public surface — every fetch goes through publicScope.
  // entries.listAll() returns every public-visible entry in a single query
  // so dashboard render time stays constant regardless of journal count.
  const scope = await publicScope(user.id)
  const [journals, allEntries] = await Promise.all([
    scope.journals.list(),
    scope.entries.listAll(),
  ])
  const journalsById = new Map(journals.map((j) => [j.journal_id, j]))

  const [profileResult, topTagResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name')
      .eq('user_id', user.id)
      .single(),
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

  // Sort entries by entry_date DESC, then created_at DESC, for both the
  // recent list and the streak/date histograms.
  const sortedByDate = [...allEntries].sort((a, b) => {
    if (a.entry_date !== b.entry_date) return a.entry_date < b.entry_date ? 1 : -1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })
  const sortedByCreated = [...allEntries].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  const totalEntries = allEntries.length
  const thisMonth = allEntries.filter((e) => e.entry_date >= firstOfMonthStr).length

  const allDates = sortedByDate.map((e) => e.entry_date)
  const { current: currentStreak, best: bestStreak } = computeStreaks(allDates)

  const lastEntryAt = sortedByCreated[0]?.created_at ?? null

  // Week activity
  const weekDays = getCurrentWeekDays()
  const weekStart = weekDays[0].dateStr
  const weekEnd = weekDays[6].dateStr
  const weekDateCounts = new Map<string, number>()
  for (const e of allEntries) {
    if (e.entry_date >= weekStart && e.entry_date <= weekEnd) {
      weekDateCounts.set(e.entry_date, (weekDateCounts.get(e.entry_date) ?? 0) + 1)
    }
  }
  const thisWeek = [...weekDateCounts.values()].reduce((a, b) => a + b, 0)
  const weekActivityDays = weekDays.map((d) => ({
    label: d.label,
    date: d.date,
    count: weekDateCounts.get(d.dateStr) ?? 0,
  }))

  // Recent entries — top 5 by created_at, hydrate journal title/colour from
  // the same publicScope journals fetched above.
  const recentEntries = sortedByCreated.slice(0, 5).map((e) => {
    const journal = journalsById.get(e.journal_id)
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
