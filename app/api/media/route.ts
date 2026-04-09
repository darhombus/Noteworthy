import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkStorageQuota, formatStorageSize } from '@/lib/storage/quota'

const ALLOWED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
])
const ALLOWED_VIDEO_MIMES = new Set(['video/mp4', 'video/webm'])

const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const MAX_VIDEO_BYTES = 30 * 1024 * 1024

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

  const isVideo = file.type.startsWith('video/')
  const isImage = file.type.startsWith('image/')

  // File-type validation
  if (isVideo && !ALLOWED_VIDEO_MIMES.has(file.type)) {
    return NextResponse.json(
      { error: 'Video type not allowed. Accepted: MP4, WebM' },
      { status: 400 },
    )
  }
  if (!isVideo && (!isImage || !ALLOWED_IMAGE_MIMES.has(file.type))) {
    return NextResponse.json(
      { error: 'File type not allowed. Accepted: JPEG, PNG, GIF, WebP, MP4, WebM' },
      { status: 400 },
    )
  }

  // File size validation
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    return NextResponse.json(
      { error: 'Video too large. Maximum size after trimming is 30 MB' },
      { status: 400 },
    )
  }
  if (isImage && file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: 'Image too large. Maximum size is 5 MB' },
      { status: 400 },
    )
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

  // Parse optional video metadata from form data
  const thumbnailFile = isVideo ? formData.get('thumbnail_file') : null
  const durationRaw = formData.get('duration')
  const widthRaw = formData.get('width')
  const heightRaw = formData.get('height')

  const duration =
    typeof durationRaw === 'string' && durationRaw.length > 0
      ? parseInt(durationRaw, 10)
      : null
  const width =
    typeof widthRaw === 'string' && widthRaw.length > 0 ? parseInt(widthRaw, 10) : null
  const height =
    typeof heightRaw === 'string' && heightRaw.length > 0
      ? parseInt(heightRaw, 10)
      : null

  // Quota check: for video, account for both the video AND thumbnail size
  const thumbnailSize = thumbnailFile instanceof File ? thumbnailFile.size : 0
  const totalNewSize = file.size + thumbnailSize

  const quota = await checkStorageQuota(user.id, totalNewSize)
  if (!quota.allowed) {
    return NextResponse.json(
      {
        error: `Storage limit reached. You have used ${formatStorageSize(
          quota.currentUsage,
        )} of your ${formatStorageSize(
          quota.limit,
        )} quota. This file (${formatStorageSize(
          totalNewSize,
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

  // Upload thumbnail if provided (video only)
  let thumbnailUrl: string | null = null
  let thumbnailObjectPath: string | null = null

  if (thumbnailFile instanceof File) {
    thumbnailObjectPath = `${user.id}/${entryId}/thumbnails/${Date.now()}_thumb.jpg`
    const { error: thumbUploadError } = await supabase.storage
      .from('media')
      .upload(thumbnailObjectPath, thumbnailFile, {
        contentType: 'image/jpeg',
        upsert: false,
      })
    if (!thumbUploadError) {
      const { data: thumbPublic } = supabase.storage
        .from('media')
        .getPublicUrl(thumbnailObjectPath)
      thumbnailUrl = thumbPublic.publicUrl
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from('media')
    .insert({
      entry_id: entryId,
      file_name: file.name,
      file_url: publicUrl,
      object_path: objectPath,
      file_type: isVideo ? 'video' : 'image',
      file_size: totalNewSize,
      mime_type: file.type,
      duration: isVideo ? duration : null,
      width: width,
      height: height,
      thumbnail_url: thumbnailUrl,
    })
    .select('media_id, file_url')
    .single()

  if (insertError || !inserted) {
    // Roll back the uploaded objects so they don't count against quota.
    await supabase.storage.from('media').remove([objectPath])
    if (thumbnailObjectPath) {
      await supabase.storage.from('media').remove([thumbnailObjectPath])
    }
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  return NextResponse.json(
    {
      media_id: inserted.media_id,
      file_url: inserted.file_url,
      thumbnail_url: thumbnailUrl,
    },
    { status: 200 },
  )
}
