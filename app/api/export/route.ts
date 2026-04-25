import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import JSZip from 'jszip'
import { createClient } from '@/lib/supabase/server'
import { extractPlainText, type RichTextNode } from '@/lib/utils/extractPlainText'
import { tiptapToMarkdown } from '@/lib/utils/tiptapToMarkdown'
import { isTiptapDoc, EMPTY_TIPTAP_DOC } from '@/lib/types/tiptap'
import type { Json } from '@/types/supabase'

// ---------------------------------------------------------------------------
// Query param schema
// ---------------------------------------------------------------------------

const exportSchema = z.object({
  format: z.enum(['json', 'markdown']),
  scope: z.enum(['entry', 'journal', 'all']),
  entryId: z.string().uuid().optional(),
  journalId: z.string().uuid().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'from must be YYYY-MM-DD')
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'to must be YYYY-MM-DD')
    .optional(),
  includeTags: z.enum(['true', 'false']).optional(),
})

// ---------------------------------------------------------------------------
// Row shape returned by the nested select
// ---------------------------------------------------------------------------

interface EntryRow {
  entry_id: string
  title: string | null
  entry_date: string
  created_at: string
  updated_at: string
  word_count: number
  is_pinned: boolean
  journal_id: string
  content: Json
  journals: { title: string }
  entry_tags: Array<{ tags: { tag_name: string } | null }>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(title: string | null): string {
  if (!title) return 'untitled'
  const slug = title
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 50)
    .replace(/-+$/, '')
  return slug || 'untitled'
}

function buildFilename(row: EntryRow, ext: string): string {
  return `${row.entry_date}_${slugify(row.title)}.${ext}`
}

function deduplicator() {
  const seen = new Map<string, number>()
  return function unique(name: string): string {
    const count = seen.get(name) ?? 0
    seen.set(name, count + 1)
    if (count === 0) return name
    const dot = name.lastIndexOf('.')
    return dot === -1
      ? `${name}_${count + 1}`
      : `${name.slice(0, dot)}_${count + 1}${name.slice(dot)}`
  }
}

function toEntryJson(row: EntryRow, tags: string[]) {
  return {
    entry_id: row.entry_id,
    title: row.title,
    entry_date: row.entry_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
    word_count: row.word_count,
    is_pinned: row.is_pinned,
    journal_id: row.journal_id,
    journal_title: row.journals.title,
    tags,
    content: row.content,
    plain_text: extractPlainText(row.content as unknown as RichTextNode),
  }
}

function toEntryMarkdown(row: EntryRow, tags: string[], includeTags: boolean): string {
  const doc = isTiptapDoc(row.content) ? row.content : EMPTY_TIPTAP_DOC
  const title = row.title ?? 'Untitled'
  const lines: string[] = [
    `# ${title}`,
    '',
    `**Date:** ${row.entry_date}  |  **Journal:** ${row.journals.title}`,
  ]
  if (includeTags && tags.length > 0) {
    lines.push(`**Tags:** ${tags.join(', ')}`)
  }
  lines.push('')
  lines.push(tiptapToMarkdown(doc))
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Entry select fragment — shared across scopes
// ---------------------------------------------------------------------------

const ENTRY_SELECT = `
  entry_id, title, entry_date, created_at, updated_at,
  word_count, is_pinned, journal_id, content,
  journals!inner(title),
  entry_tags(tags(tag_name))
` as const

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Parse and validate query params
  const raw = Object.fromEntries(request.nextUrl.searchParams.entries())
  const parsed = exportSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid parameters' },
      { status: 400 },
    )
  }

  const { format, scope, entryId, journalId, from, to, includeTags: includeTagsRaw } =
    parsed.data
  const includeTags = (includeTagsRaw ?? 'true') === 'true'

  // Validate scope ↔ id pairing
  if (scope === 'entry' && !entryId) {
    return NextResponse.json({ error: 'entryId is required when scope=entry' }, { status: 400 })
  }
  if (scope === 'journal' && !journalId) {
    return NextResponse.json(
      { error: 'journalId is required when scope=journal' },
      { status: 400 },
    )
  }

  const ext = format === 'json' ? 'json' : 'md'

  // ---------------------------------------------------------------------------
  // Fetch entries
  // ---------------------------------------------------------------------------

  let rows: EntryRow[]

  // Hidden journals/entries are excluded from every export scope. The user
  // can unhide them temporarily from /hidden if they want them in the dump.
  if (scope === 'entry') {
    const { data, error } = await supabase
      .from('entries')
      .select(ENTRY_SELECT)
      .eq('entry_id', entryId!)
      .eq('is_hidden', false)
      .is('deleted_at', null)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
    }
    rows = [data as unknown as EntryRow]
  } else if (scope === 'journal') {
    // Verify journal is accessible (RLS + ownership) — and not hidden.
    const { data: journalCheck } = await supabase
      .from('journals')
      .select('journal_id')
      .eq('journal_id', journalId!)
      .eq('is_hidden', false)
      .single()

    if (!journalCheck) {
      return NextResponse.json({ error: 'Journal not found' }, { status: 404 })
    }

    let q = supabase
      .from('entries')
      .select(ENTRY_SELECT)
      .eq('journal_id', journalId!)
      .eq('is_hidden', false)
      .is('deleted_at', null)
      .order('entry_date', { ascending: false })

    if (from) q = q.gte('entry_date', from)
    if (to) q = q.lte('entry_date', to)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows = (data ?? []) as unknown as EntryRow[]
  } else {
    // scope === 'all' — RLS ensures only the user's entries are returned.
    // Pre-fetch hidden journal ids so entries inside hidden journals are
    // excluded too (entries.is_hidden alone wouldn't catch those).
    const { data: hiddenJournalRows } = await supabase
      .from('journals')
      .select('journal_id')
      .eq('is_hidden', true)
    const hiddenJournalIds = (hiddenJournalRows ?? []).map((r) => r.journal_id)

    let q = supabase
      .from('entries')
      .select(ENTRY_SELECT)
      .eq('is_hidden', false)
      .is('deleted_at', null)
      .order('entry_date', { ascending: false })

    if (hiddenJournalIds.length > 0) {
      q = q.not('journal_id', 'in', `(${hiddenJournalIds.join(',')})`)
    }
    if (from) q = q.gte('entry_date', from)
    if (to) q = q.lte('entry_date', to)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    rows = (data ?? []) as unknown as EntryRow[]
  }

  // ---------------------------------------------------------------------------
  // Build file contents
  // ---------------------------------------------------------------------------

  function tagsFor(row: EntryRow): string[] {
    if (!includeTags) return []
    return row.entry_tags
      .map((et) => et.tags?.tag_name)
      .filter((n): n is string => n != null)
  }

  function fileContent(row: EntryRow): string {
    const tags = tagsFor(row)
    if (format === 'json') {
      return JSON.stringify(toEntryJson(row, tags), null, 2)
    }
    return toEntryMarkdown(row, tags, includeTags)
  }

  // ---------------------------------------------------------------------------
  // Single entry — return file directly
  // ---------------------------------------------------------------------------

  if (rows.length === 1) {
    const row = rows[0]
    const filename = buildFilename(row, ext)
    const body = fileContent(row)
    const contentType = format === 'json' ? 'application/json' : 'text/markdown'

    return new NextResponse(body, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })
  }

  // ---------------------------------------------------------------------------
  // Multiple entries — ZIP
  // ---------------------------------------------------------------------------

  const zip = new JSZip()
  const unique = deduplicator()

  for (const row of rows) {
    const filename = unique(buildFilename(row, ext))
    zip.file(filename, fileContent(row))
  }

  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' })

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="noteworthy-export.zip"',
    },
  })
}
