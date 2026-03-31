import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = request.nextUrl
  const q = searchParams.get('q')

  // Sanitize q: max 100 chars, trimmed
  const sanitizedQ = q ? q.trim().slice(0, 100) : null

  let query = supabase
    .from('tags')
    .select('tag_id, tag_name, color, usage_count')
    .order('usage_count', { ascending: false })
    .order('tag_name', { ascending: true })

  if (sanitizedQ && sanitizedQ.length > 0) {
    // Parameterized ILIKE filter — no string concatenation
    query = query.ilike('tag_name', `%${sanitizedQ}%`)
  }

  const { data: tags, error } = await query

  if (error) {
    console.error('Failed to fetch tags:', error)
    return NextResponse.json({ error: 'Failed to load tags' }, { status: 500 })
  }

  return NextResponse.json(tags ?? [])
}
