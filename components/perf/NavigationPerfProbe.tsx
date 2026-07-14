'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

declare global {
  interface Window {
    __nwNavStart?: number
    __nwNavFrom?: string
    __nwNavTo?: string
  }
}

const PERF_ENABLED = process.env.NEXT_PUBLIC_NW_PERF_LOG !== '0'

export default function NavigationPerfProbe() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const previousPathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!PERF_ENABLED) return

    const onClickCapture = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest('a[href]') as HTMLAnchorElement | null
      if (!anchor) return
      if (!anchor.href) return
      if (anchor.target && anchor.target !== '_self') return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return

      window.__nwNavStart = performance.now()
      window.__nwNavFrom = window.location.pathname + window.location.search
      window.__nwNavTo = url.pathname + url.search
    }

    window.addEventListener('click', onClickCapture, true)
    return () => window.removeEventListener('click', onClickCapture, true)
  }, [])

  useEffect(() => {
    if (!PERF_ENABLED) return

    const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`
    const previous = previousPathRef.current
    previousPathRef.current = current
    if (!previous || previous === current) return

    const navStart = window.__nwNavStart
    if (typeof navStart === 'number') {
      const elapsed = performance.now() - navStart
      console.info(
        `[NW_PERF_CLIENT] nav.complete ${elapsed.toFixed(1)}ms from=${window.__nwNavFrom ?? previous} to=${current}`,
      )
      window.__nwNavStart = undefined
      window.__nwNavFrom = undefined
      window.__nwNavTo = undefined
    } else {
      console.info(`[NW_PERF_CLIENT] nav.path_changed from=${previous} to=${current}`)
    }
  }, [pathname, searchParams])

  return null
}

