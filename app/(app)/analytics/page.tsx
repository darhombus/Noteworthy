import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getCurrentUserId } from '@/lib/auth/server'
import { getPerfTraceId, timePerf } from '@/lib/perf/server'
import { withHotCache } from '@/lib/perf/hot-cache'
import AnalyticsSummary from '@/components/analytics/AnalyticsSummary'
import WritingActivity from '@/components/analytics/WritingActivity'
import CalendarHeatmap from '@/components/analytics/CalendarHeatmap'
import EntriesByJournal from '@/components/analytics/EntriesByJournal'
import TimePatterns from '@/components/analytics/TimePatterns'
import TopTags from '@/components/analytics/TopTags'

const pad = (n: number) => String(n).padStart(2, '0')
const localDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

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

function buildRangeSeries(
  dayCounts: Map<string, number>,
  range: '7D' | '30D' | '12M',
): { labels: string[]; data: number[] } {
  const now = new Date()
  if (range === '12M') {
    const slots = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
      return {
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('en-US', { month: 'short' }),
      }
    })
    const data = slots.map((slot) => {
      let monthTotal = 0
      for (const [date, count] of dayCounts) {
        if (date.startsWith(slot.key)) monthTotal += count
      }
      return monthTotal
    })
    return { labels: slots.map((s) => s.label), data }
  }

  const days = range === '7D' ? 7 : 30
  const slots = Array.from({ length: days }, (_, i) => {
    const d = new Date(now)
    d.setDate(now.getDate() - (days - 1 - i))
    return {
      key: localDateStr(d),
      label:
        range === '7D'
          ? d.toLocaleDateString('en-US', { weekday: 'short' })
          : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    }
  })

  return {
    labels: slots.map((s) => s.label),
    data: slots.map((s) => dayCounts.get(s.key) ?? 0),
  }
}

export default async function AnalyticsPage() {
  const trace = await getPerfTraceId()
  return timePerf(
    'page.analytics.total',
    async () => {
      const userId = await getCurrentUserId()
      if (!userId) redirect('/login')
      const supabase = await createClient()

      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const oneYearAgoStr = localDateStr(oneYearAgo)

      const firstOfMonth = new Date()
      firstOfMonth.setDate(1)
      firstOfMonth.setHours(0, 0, 0, 0)
      const firstOfMonthStr = localDateStr(firstOfMonth)
      const firstOfNextMonth = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() + 1, 1)
      const firstOfNextMonthStr = localDateStr(firstOfNextMonth)

      const [entryDatesResult, journalsResult, tagsResult] = await timePerf(
        'page.analytics.main_queries',
        () => {
          const hotKey = `analytics:main:${userId}:${oneYearAgoStr}`
          return withHotCache(hotKey, 20_000, () =>
            Promise.all([
              timePerf(
                'page.analytics.q.entry_dates_last_year',
                async () =>
                  await supabase
                    .from('entries')
                    .select('entry_date, created_at, journals!inner(user_id, is_hidden)')
                    .eq('is_hidden', false)
                    .eq('journals.user_id', userId)
                    .eq('journals.is_hidden', false)
                    .is('deleted_at', null)
                    .gte('entry_date', oneYearAgoStr)
                    .order('entry_date', { ascending: false }),
                { trace, userId },
              ),
              timePerf(
                'page.analytics.q.journals_rollup',
                async () =>
                  await supabase
                    .from('journals')
                    .select('title, color, entry_count, total_word_count')
                    .eq('user_id', userId)
                    .eq('is_hidden', false)
                    .is('deleted_at', null)
                    .gt('entry_count', 0)
                    .order('entry_count', { ascending: false }),
                { trace, userId },
              ),
              timePerf(
                'page.analytics.q.tags_top10',
                async () =>
                  await supabase
                    .from('tags')
                    .select('tag_name, usage_count, color')
                    .eq('user_id', userId)
                    .gt('usage_count', 0)
                    .order('usage_count', { ascending: false })
                    .limit(10),
                { trace, userId },
              ),
            ]),
          )
        },
        { trace, userId },
      )

      const totalEntries = (journalsResult.data ?? []).reduce((sum, j) => sum + j.entry_count, 0)
      const totalWords = (journalsResult.data ?? []).reduce((sum, j) => sum + j.total_word_count, 0)
      const avgWords = totalEntries > 0 ? Math.round(totalWords / totalEntries) : 0

      const dayCounts = new Map<string, number>()
      for (const row of entryDatesResult.data ?? []) {
        dayCounts.set(row.entry_date, (dayCounts.get(row.entry_date) ?? 0) + 1)
      }
      const allDates = Array.from(dayCounts.keys()).sort((a, b) => (a < b ? 1 : -1))
      const currentStreak = computeCurrentStreak(allDates)

      const today = new Date()
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay())
      const weekStartStr = localDateStr(weekStart)
      const todayStr = localDateStr(today)

      const weekDayCounts = new Map<string, number>()
      for (const [entryDate, count] of dayCounts) {
        if (entryDate >= weekStartStr && entryDate <= todayStr) {
          weekDayCounts.set(entryDate, (weekDayCounts.get(entryDate) ?? 0) + count)
        }
      }
      let mostActiveDay = '—'
      let maxDayCount = 0
      for (const [date, count] of weekDayCounts) {
        if (count > maxDayCount) {
          maxDayCount = count
          mostActiveDay = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', {
            weekday: 'long',
          })
        }
      }

      const monthLabel = firstOfMonth.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      })

      const writingActivitySeries = {
        dayCounts: Object.fromEntries(dayCounts),
        byRange: {
          '7D': buildRangeSeries(dayCounts, '7D'),
          '30D': buildRangeSeries(dayCounts, '30D'),
          '12M': buildRangeSeries(dayCounts, '12M'),
        },
      }

      const monthPeriodCounts = { morning: 0, noon: 0, evening: 0, night: 0 }
      for (const row of entryDatesResult.data ?? []) {
        if (row.entry_date < firstOfMonthStr || row.entry_date >= firstOfNextMonthStr) continue
        const h = new Date(row.created_at).getHours()
        if (h >= 5 && h <= 11) monthPeriodCounts.morning += 1
        else if (h >= 12 && h <= 17) monthPeriodCounts.noon += 1
        else if (h >= 18 && h <= 21) monthPeriodCounts.evening += 1
        else monthPeriodCounts.night += 1
      }

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

          <AnalyticsSummary
            totalEntries={totalEntries}
            currentStreak={currentStreak}
            avgWords={avgWords}
            mostActiveDay={mostActiveDay}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <WritingActivity key={Object.keys(writingActivitySeries.dayCounts).length} series={writingActivitySeries} />
            </div>
            <CalendarHeatmap
              key={Object.keys(writingActivitySeries.dayCounts).length}
              dayCounts={writingActivitySeries.dayCounts}
              initialYear={today.getFullYear()}
              initialMonth={today.getMonth()}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <EntriesByJournal journals={journals} />
            <TimePatterns counts={monthPeriodCounts} monthLabel={monthLabel} />
            <TopTags tags={tags} />
          </div>
        </div>
      )
    },
    { trace },
  )
}
