interface TimePatternsProps {
  counts: {
    morning: number
    noon: number
    evening: number
    night: number
  }
  monthLabel: string // e.g. "April 2026"
}

const PERIODS = [
  {
    label: 'Morning',
    interval: '5:00 AM – 11:59 AM',
    icon: '🌅',
    test: (h: number) => h >= 5 && h <= 11,
    colorClass: 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900',
    labelClass: 'text-amber-700 dark:text-amber-400',
    countClass: 'text-amber-600 dark:text-amber-300',
  },
  {
    label: 'Noon',
    interval: '12:00 PM – 5:59 PM',
    icon: '☀️',
    test: (h: number) => h >= 12 && h <= 17,
    colorClass: 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-900',
    labelClass: 'text-sky-700 dark:text-sky-400',
    countClass: 'text-sky-600 dark:text-sky-300',
  },
  {
    label: 'Evening',
    interval: '6:00 PM – 9:59 PM',
    icon: '🌆',
    test: (h: number) => h >= 18 && h <= 21,
    colorClass: 'bg-violet-50 dark:bg-violet-950/40 border-violet-200 dark:border-violet-900',
    labelClass: 'text-violet-700 dark:text-violet-400',
    countClass: 'text-violet-600 dark:text-violet-300',
  },
  {
    label: 'Night',
    interval: '10:00 PM – 4:59 AM',
    icon: '🌙',
    test: (h: number) => h >= 22 || h <= 4,
    colorClass: 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700',
    labelClass: 'text-slate-600 dark:text-slate-400',
    countClass: 'text-slate-700 dark:text-slate-300',
  },
] as const

export default function TimePatterns({ counts, monthLabel }: TimePatternsProps) {
  const periodCounts = [counts.morning, counts.noon, counts.evening, counts.night]

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6">
      <div className="flex items-baseline justify-between mb-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          Writing Time Patterns
        </h2>
        <span className="text-xs text-[#9E9E9E]">{monthLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PERIODS.map((period, i) => (
          <div
            key={period.label}
            className={`rounded-xl border p-4 ${period.colorClass}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base leading-none">{period.icon}</span>
              <span className={`text-sm font-semibold ${period.labelClass}`}>
                {period.label}
              </span>
            </div>
            <p className={`text-3xl font-bold ${period.countClass}`}>{periodCounts[i]}</p>
            <p className="text-[10px] text-[#9E9E9E] mt-1 leading-tight">{period.interval}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
