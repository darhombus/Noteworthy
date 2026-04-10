import { BookOpen, Calendar, BarChart2, Flame, Trophy, Tag } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface StatCard {
  label: string
  value: string
  subtext: string
  colorClass: string
  Icon: LucideIcon
}

interface StatsCardsProps {
  totalEntries: number
  thisMonth: number
  thisWeek: number
  currentStreak: number
  bestStreak: number
  topTag: string | null
}

export default function StatsCards({
  totalEntries,
  thisMonth,
  thisWeek,
  currentStreak,
  bestStreak,
  topTag,
}: StatsCardsProps) {
  const monthName = new Date().toLocaleString('default', { month: 'long' })

  const cards: StatCard[] = [
    {
      label: 'Total Entries',
      value: String(totalEntries),
      subtext: 'all time',
      colorClass: 'bg-[#1976D2]',
      Icon: BookOpen,
    },
    {
      label: 'This Month',
      value: String(thisMonth),
      subtext: monthName,
      colorClass: 'bg-emerald-600',
      Icon: Calendar,
    },
    {
      label: 'This Week',
      value: String(thisWeek),
      subtext: 'Sun – Sat',
      colorClass: 'bg-sky-500',
      Icon: BarChart2,
    },
    {
      label: 'Current Streak',
      value: String(currentStreak),
      subtext: currentStreak === 1 ? 'day' : 'days',
      colorClass: 'bg-orange-500',
      Icon: Flame,
    },
    {
      label: 'Best Streak',
      value: String(bestStreak),
      subtext: bestStreak === 1 ? 'day' : 'days',
      colorClass: 'bg-amber-500',
      Icon: Trophy,
    },
    {
      label: 'Top Tag',
      value: topTag ?? '—',
      subtext: topTag ? 'most used' : 'no tags yet',
      colorClass: 'bg-violet-600',
      Icon: Tag,
    },
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
