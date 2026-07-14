import { redirect } from 'next/navigation'
import { getCurrentUserId } from '@/lib/auth/server'
import { publicScope } from '@/lib/data/scope'
import { getPerfTraceId, timePerf } from '@/lib/perf/server'
import JournalGrid from '@/components/journals/JournalGrid'

export default async function JournalsPage() {
  const trace = await getPerfTraceId()
  return timePerf(
    'page.journals.total',
    async () => {
      const userId = await getCurrentUserId()
      if (!userId) redirect('/login')

      const journals = await timePerf(
        'page.journals.data',
        async () => {
          const scope = await publicScope(userId)
          return scope.journals.list()
        },
        { trace, userId },
      )

      return (
        <>
          <JournalGrid journals={journals} />
        </>
      )
    },
    { trace },
  )
}
