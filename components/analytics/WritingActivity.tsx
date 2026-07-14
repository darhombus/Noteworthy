'use client'

import dynamic from 'next/dynamic'

interface EntryPoint {
  labels: string[]
  data: number[]
}

interface WritingActivityProps {
  series: {
    dayCounts: Record<string, number>
    byRange: {
      '7D': EntryPoint
      '30D': EntryPoint
      '12M': EntryPoint
    }
  }
}

const Chart = dynamic(() => import('./WritingActivity.chart'), {
  ssr: false,
  loading: () => (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-xl border border-[#E0E0E0] dark:border-[#3A3A3A] p-6 h-80">
      <div className="h-5 w-32 rounded bg-[#E0E0E0] dark:bg-[#3A3A3A] mb-4 animate-pulse" />
      <div className="h-60 rounded bg-[#F3F4F6] dark:bg-[#2A2A2A] animate-pulse" />
    </div>
  ),
})

export default function WritingActivity(props: WritingActivityProps) {
  return <Chart {...props} />
}
