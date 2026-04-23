'use client'

import { useEffect } from 'react'
import { useUIStore } from '@/store/useUIStore'

interface BreadcrumbTitleProps {
  id: string
  title: string
}

export default function BreadcrumbTitle({ id, title }: BreadcrumbTitleProps) {
  const setBreadcrumbTitle = useUIStore((s) => s.setBreadcrumbTitle)
  const clearBreadcrumbTitle = useUIStore((s) => s.clearBreadcrumbTitle)

  useEffect(() => {
    setBreadcrumbTitle(id, title)
    return () => clearBreadcrumbTitle(id)
  }, [id, title, setBreadcrumbTitle, clearBreadcrumbTitle])

  return null
}
