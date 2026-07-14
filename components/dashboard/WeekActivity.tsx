'use client'

// Thin wrapper that lazy-loads the Chart.js bundle (≈80KB). The dashboard
// route otherwise pulls Chart.js into its initial chunk just to render this
// one bar chart — defer it so first paint is faster.
import dynamic from 'next/dynamic'

interface DayData {
  label: string
  date: string
  count: number
}

interface WeekActivityProps {
  days: DayData[]
}

const Chart = dynamic(() => import('./WeekActivity.chart'), {
  ssr: false,
  loading: () => (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6">
      <div className="h-5 w-24 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] mb-4 animate-pulse" />
      <div className="h-44 rounded bg-[#F3F4F6] dark:bg-[#2A2A2A] animate-pulse" />
    </div>
  ),
})

export default function WeekActivity(props: WeekActivityProps) {
  return <Chart {...props} />
}
