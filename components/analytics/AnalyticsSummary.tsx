import { BookOpen, Flame, PenLine, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface StatCard {
  label: string
  value: string
  subtext: string
  colorClass: string
  Icon: LucideIcon
}

interface AnalyticsSummaryProps {
  totalEntries: number
  currentStreak: number
  avgWords: number
  mostActiveDay: string
}

export default function AnalyticsSummary({
  totalEntries,
  currentStreak,
  avgWords,
  mostActiveDay,
}: AnalyticsSummaryProps) {
  const cards: StatCard[] = [
    {
      label: 'Total Entries',
      value: String(totalEntries),
      subtext: 'all time',
      colorClass: 'bg-[#1976D2]',
      Icon: BookOpen,
    },
    {
      label: 'Current Streak',
      value: String(currentStreak),
      subtext: currentStreak === 1 ? 'day' : 'days',
      colorClass: 'bg-orange-500',
      Icon: Flame,
    },
    {
      label: 'Avg Words / Entry',
      value: avgWords > 0 ? avgWords.toLocaleString() : '—',
      subtext: 'all time',
      colorClass: 'bg-violet-600',
      Icon: PenLine,
    },
    {
      label: 'Most Active Day',
      value: mostActiveDay,
      subtext: 'this week',
      colorClass: 'bg-emerald-600',
      Icon: CalendarDays,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.label} className={`${card.colorClass} rounded-xl p-5 text-white`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-white/80">{card.label}</p>
              <p className="text-3xl font-bold mt-1 truncate">{card.value}</p>
              <p className="text-sm text-white/70 mt-0.5">{card.subtext}</p>
            </div>
            <div className="flex-shrink-0 p-2 bg-white/20 rounded-lg">
              <card.Icon size={20} className="text-white" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
