import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local') })

export function createFixtureClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Missing Supabase env vars — check .env.local')
  return createClient(url, key)
}

/** Draft block with no shift instances — publish API sees gaps = [] and succeeds directly. */
export async function createDraftCoveredBlock(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from('roster_blocks')
    .insert({
      name: `__e2e_draft_covered_${crypto.randomUUID()}__`,
      start_date: '2099-01-01',
      end_date: '2099-01-28',
      status: 'draft',
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createDraftCoveredBlock: ${error?.message}`)
  return data.id as string
}

/**
 * Draft block with one unfilled morning shift — publish API returns 409 with gaps.
 * Returns blockId + areaId (both needed for cleanup).
 */
export async function createDraftGapsBlock(
  db: SupabaseClient
): Promise<{ blockId: string; areaId: string; areaName: string }> {
  const areaName = `__e2e_area_${crypto.randomUUID()}__`
  const { data: area, error: areaErr } = await db
    .from('areas')
    .insert({ name: areaName, min_staff_per_shift: 1 })
    .select('id')
    .single()
  if (areaErr || !area) throw new Error(`createDraftGapsBlock area: ${areaErr?.message}`)

  const { data: block, error: blockErr } = await db
    .from('roster_blocks')
    .insert({
      name: `__e2e_draft_gaps_${crypto.randomUUID()}__`,
      start_date: '2099-02-01',
      end_date: '2099-02-28',
      status: 'draft',
    })
    .select('id')
    .single()
  if (blockErr || !block) throw new Error(`createDraftGapsBlock block: ${blockErr?.message}`)

  // Shift with no template_id → required defaults to 1; no assignments → filled = 0.
  const { error: siErr } = await db.from('shift_instances').insert({
    roster_block_id: block.id,
    area_id: area.id,
    shift_type: 'morning',
    shift_date: '2099-02-03',
    start_time: '08:00:00',
    end_time: '16:00:00',
  })
  if (siErr) throw new Error(`createDraftGapsBlock shift_instance: ${siErr.message}`)

  return { blockId: block.id as string, areaId: area.id as string, areaName }
}

/** Published block (no shift instances needed for archive/view tests). */
export async function createPublishedBlock(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from('roster_blocks')
    .insert({
      name: `__e2e_published_${crypto.randomUUID()}__`,
      start_date: '2099-03-01',
      end_date: '2099-03-28',
      status: 'published',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createPublishedBlock: ${error?.message}`)
  return data.id as string
}

/** Archived block (for idempotent-archive and view-404 tests). */
export async function createArchivedBlock(db: SupabaseClient): Promise<string> {
  const { data, error } = await db
    .from('roster_blocks')
    .insert({
      name: `__e2e_archived_${crypto.randomUUID()}__`,
      start_date: '2099-04-01',
      end_date: '2099-04-28',
      status: 'archived',
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`createArchivedBlock: ${error?.message}`)
  return data.id as string
}

/**
 * Deletes roster blocks (cascade removes shift_instances + assignments),
 * then removes any test areas created alongside gap blocks.
 */
export async function cleanupBlocks(
  db: SupabaseClient,
  blockIds: string[],
  areaIds: string[] = []
): Promise<void> {
  if (blockIds.length > 0) {
    const { error } = await db.from('roster_blocks').delete().in('id', blockIds)
    if (error) console.error('cleanupBlocks blocks:', error.message)
  }
  if (areaIds.length > 0) {
    const { error } = await db.from('areas').delete().in('id', areaIds)
    if (error) console.error('cleanupBlocks areas:', error.message)
  }
}
