import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkStorageQuota, formatStorageSize } from '@/lib/storage/quota'

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  const entryId = formData.get('entry_id')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }
  if (typeof entryId !== 'string' || entryId.length === 0) {
    return NextResponse.json({ error: 'Missing entry_id' }, { status: 400 })
  }

  // Ownership verification: the entry must belong to a journal owned by the
  // current user. RLS would also block the insert, but we check here so we
  // never burn quota or upload bytes to Storage for a forbidden entry.
  const { data: ownership } = await supabase
    .from('entries')
    .select('entry_id, journals!inner(user_id)')
    .eq('entry_id', entryId)
    .eq('journals.user_id', user.id)
    .maybeSingle()

  if (!ownership) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  // File-type / size validation
  if (!ALLOWED_IMAGE_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: 'File type not allowed. Accepted: JPEG, PNG, GIF, WebP' },
      { status: 400 },
    )
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'File too large. Maximum size is 5 MB' },
      { status: 400 },
    )
  }

  // Quota check BEFORE touching Storage
  const quota = await checkStorageQuota(user.id, file.size)
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: `Storage limit reached. You have used ${formatStorageSize(
          quota.currentUsage,
        )} of your ${formatStorageSize(
          quota.limit,
        )} quota. This file (${formatStorageSize(
          file.size,
        )}) exceeds your remaining space (${formatStorageSize(
          quota.remainingSpace,
        )}).`,
      },
      { status: 400 },
    )
  }

  const safeName = sanitizeFileName(file.name)
  const objectPath = `${user.id}/${entryId}/${Date.now()}_${safeName}`

  const { error: uploadError } = await supabase.storage
    .from('media')
    .upload(objectPath, file, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('media').getPublicUrl(objectPath)

  const { data: inserted, error: insertError } = await supabase
    .from('media')
    .insert({
      entry_id: entryId,
      file_name: file.name,
      file_url: publicUrl,
      object_path: objectPath,
      file_type: 'image',
      file_size: file.size,
      mime_type: file.type,
    })
    .select('media_id, file_url')
    .single()

  if (insertError || !inserted) {
    // Roll back the uploaded object so it doesn't count against quota.
    await supabase.storage.from('media').remove([objectPath])
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  return NextResponse.json(
    { media_id: inserted.media_id, file_url: inserted.file_url },
    { status: 200 },
  )
}
