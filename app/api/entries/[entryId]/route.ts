import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { updateEntrySchema } from '@/lib/validations/entries'
import type { Database } from '@/types/supabase'

type Json = Database['public']['Tables']['entries']['Insert']['content']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const { entryId } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let rawBody: Record<string, unknown>
  try {
    rawBody = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const clientUpdatedAt = rawBody.updated_at as string | undefined
  const force = (rawBody.force as boolean | undefined) ?? false
  const { updated_at: _u, force: _f, ...entryData } = rawBody

  const parsed = updateEntrySchema.safeParse(entryData)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
      { status: 400 },
    )
  }

  if (!force && clientUpdatedAt) {
    const { data: current } = await supabase
      .from('entries')
      .select('updated_at')
      .eq('entry_id', entryId)
      .single()

    if (!current) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

    const dbTime = new Date(current.updated_at).getTime()
    const clientTime = new Date(clientUpdatedAt).getTime()
    if (dbTime !== clientTime) return NextResponse.json({ conflict: true }, { status: 409 })
  }

  const { data: updated, error } = await supabase
    .from('entries')
    .update({
      ...(parsed.data.title !== undefined && { title: parsed.data.title }),
      ...(parsed.data.entry_date !== undefined && { entry_date: parsed.data.entry_date }),
      ...(parsed.data.is_pinned !== undefined && { is_pinned: parsed.data.is_pinned }),
      content: parsed.data.content as Json,
    })
    .eq('entry_id', entryId)
    .select('updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, updated_at: updated.updated_at })
}
