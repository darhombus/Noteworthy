import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AnalyticsSummary from '@/components/analytics/AnalyticsSummary'
import WritingActivity from '@/components/analytics/WritingActivity'
import CalendarHeatmap from '@/components/analytics/CalendarHeatmap'
import EntriesByJournal from '@/components/analytics/EntriesByJournal'
import TimePatterns from '@/components/analytics/TimePatterns'
import TopTags from '@/components/analytics/TopTags'
import LiveDataRefresh from '@/components/LiveDataRefresh'

export const dynamic = 'force-dynamic'

const pad = (n: number) => String(n).padStart(2, '0')
const localDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// ---------------------------------------------------------------------------
// Streak (same inline logic as dashboard)
// ---------------------------------------------------------------------------
function computeCurrentStreak(sortedDesc: string[]): number {
  if (!sortedDesc.length) return 0
  const unique = [...new Set(sortedDesc)].sort((a, b) => (a < b ? 1 : -1))
  const todayStr = localDateStr(new Date())
  const yest = new Date()
  yest.setDate(yest.getDate() - 1)
  const yesterdayStr = localDateStr(yest)
  if (unique[0] !== todayStr && unique[0] !== yesterdayStr) return 0
  let streak = 1
  for (let i = 1; i < unique.length; i++) {
    const a = new Date(unique[i - 1])
    const b = new Date(unique[i])
    if (Math.round((a.getTime() - b.getTime()) / 86_400_000) === 1) streak++
    else break
  }
  return streak
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function AnalyticsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const oneYearAgo = new Date()
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
  const oneYearAgoStr = localDateStr(oneYearAgo)

  const [totalResult, entryDataResult, wordResult, journalsResult, tagsResult] =
    await Promise.all([
      // All-time entry count
      supabase
        .from('entries')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null),

      // Entry dates + timestamps — last 365 days (charts, heatmap, time patterns)
      supabase
        .from('entries')
        .select('entry_date, created_at')
        .is('deleted_at', null)
        .gte('entry_date', oneYearAgoStr)
        .order('entry_date', { ascending: false }),

      // All-time word counts for average calculation
      supabase
        .from('entries')
        .select('word_count')
        .is('deleted_at', null),

      // Journals with pre-computed entry counts
      supabase
        .from('journals')
        .select('title, color, entry_count')
        .is('deleted_at', null)
        .gt('entry_count', 0)
        .order('entry_count', { ascending: false }),

      // Top 10 tags
      supabase
        .from('tags')
        .select('tag_name, usage_count, color')
        .eq('user_id', user.id)
        .gt('usage_count', 0)
        .order('usage_count', { ascending: false })
        .limit(10),
    ])

  // ---- Summary stats ----
  const totalEntries = totalResult.count ?? 0

  const allWords = wordResult.data ?? []
  const totalWords = allWords.reduce((sum, e) => sum + e.word_count, 0)
  const avgWords = totalEntries > 0 ? Math.round(totalWords / totalEntries) : 0

  const allDates = (entryDataResult.data ?? []).map((e) => e.entry_date)
  const currentStreak = computeCurrentStreak(allDates)

  // Most active day THIS week (Sun–Sat), by entry count
  const today = new Date()
  const weekStart = new Date(today)
  weekStart.setDate(today.getDate() - today.getDay())
  const weekStartStr = localDateStr(weekStart)
  const todayStr = localDateStr(today)

  const weekDayCounts = new Map<string, number>()
  for (const e of entryDataResult.data ?? []) {
    if (e.entry_date >= weekStartStr && e.entry_date <= todayStr) {
      weekDayCounts.set(e.entry_date, (weekDayCounts.get(e.entry_date) ?? 0) + 1)
    }
  }
  let mostActiveDay = '—'
  let maxDayCount = 0
  for (const [date, count] of weekDayCounts) {
    if (count > maxDayCount) {
      maxDayCount = count
      // Parse date as local noon to avoid UTC-offset day shift
      mostActiveDay = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
      })
    }
  }

  // ---- Current-month boundaries (used for heatmap + time patterns) ----
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const firstOfMonthStr = localDateStr(firstOfMonth)
  const lastOfMonthStr = localDateStr(lastOfMonth)
  const monthLabel = firstOfMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })

  // ---- Props for client charts ----
  const entryPoints = (entryDataResult.data ?? []).map((e) => ({
    entryDate: e.entry_date,
    createdAt: e.created_at,
  }))

  // Current-month entries only (for TimePatterns — resets monthly)
  const currentMonthEntries = (entryDataResult.data ?? [])
    .filter((e) => e.entry_date >= firstOfMonthStr && e.entry_date <= lastOfMonthStr)
    .map((e) => ({ createdAt: e.created_at }))

  const journals = (journalsResult.data ?? []).map((j) => ({
    title: j.title,
    color: j.color,
    entryCount: j.entry_count,
  }))

  const tags = (tagsResult.data ?? []).map((t) => ({
    name: t.tag_name,
    count: t.usage_count,
    color: t.color,
  }))

  return (
    <div className="space-y-6 py-6">
      <LiveDataRefresh />

      {/* Summary */}
      <AnalyticsSummary
        totalEntries={totalEntries}
        currentStreak={currentStreak}
        avgWords={avgWords}
        mostActiveDay={mostActiveDay}
      />

      {/* Writing activity (2/3) + calendar heatmap (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <WritingActivity key={entryPoints.length} entries={entryPoints} />
        </div>
        <CalendarHeatmap
          key={entryPoints.length}
          entries={entryPoints}
          initialYear={today.getFullYear()}
          initialMonth={today.getMonth()}
        />
      </div>

      {/* Entries by journal + time patterns + top tags — same row so heights match */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <EntriesByJournal journals={journals} />
        <TimePatterns entries={currentMonthEntries} monthLabel={monthLabel} />
        <TopTags tags={tags} />
      </div>
    </div>
  )
}
