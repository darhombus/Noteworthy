import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: tags, error } = await supabase
    .from('tags')
    .select('tag_id, tag_name, color')
    .order('tag_name', { ascending: true })

  if (error) {
    console.error('Failed to fetch tags:', error)
    return NextResponse.json({ error: 'Failed to load tags' }, { status: 500 })
  }

  return NextResponse.json(tags ?? [])
}
