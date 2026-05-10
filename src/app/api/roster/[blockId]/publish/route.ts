import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return true
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  return !!user
}

interface UnresolvableGap {
  shiftInstanceId: string
  areaName: string
  date: string
  shiftType: string
  required: number
  filled: number
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  if (!await requireAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { blockId } = await params
  const url = new URL(request.url)
  const force = url.searchParams.get('force') === 'true'

  const supabase = createServiceClient()

  const { data: block, error: blockErr } = await supabase
    .from('roster_blocks')
    .select('id, status')
    .eq('id', blockId)
    .single()

  if (blockErr || !block) return NextResponse.json({ error: 'Block not found' }, { status: 404 })
  if (block.status !== 'draft') {
    return NextResponse.json(
      { error: `Cannot publish a ${block.status} block — only drafts can be published` },
      { status: 409 }
    )
  }

  const gaps = await findCoverageGaps(supabase, blockId)
  if (gaps.length > 0 && !force) {
    return NextResponse.json(
      { error: 'Coverage gaps remain', gaps },
      { status: 409 }
    )
  }

  const { data: updated, error: updateErr } = await supabase
    .from('roster_blocks')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', blockId)
    .select('id, name, start_date, end_date, status, published_at')
    .single()

  if (updateErr || !updated) {
    return NextResponse.json({ error: updateErr?.message ?? 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ block: updated, gapsOverridden: gaps.length })
}

async function findCoverageGaps(
  supabase: ReturnType<typeof createServiceClient>,
  blockId: string
): Promise<UnresolvableGap[]> {
  const [shiftsRes, templatesRes, areasRes] = await Promise.all([
    supabase
      .from('shift_instances')
      .select('id, template_id, area_id, shift_type, shift_date')
      .eq('roster_block_id', blockId),
    supabase.from('shift_templates').select('id, required_staff'),
    supabase.from('areas').select('id, name'),
  ])

  if (shiftsRes.error) throw new Error(`shifts: ${shiftsRes.error.message}`)
  if (templatesRes.error) throw new Error(`templates: ${templatesRes.error.message}`)
  if (areasRes.error) throw new Error(`areas: ${areasRes.error.message}`)

  const shifts = shiftsRes.data ?? []
  const templates = new Map((templatesRes.data ?? []).map(t => [t.id, t.required_staff]))
  const areaNames = new Map((areasRes.data ?? []).map(a => [a.id, a.name]))

  if (shifts.length === 0) return []

  const shiftIds = shifts.map(s => s.id)
  const { data: assignments, error: assignErr } = await supabase
    .from('assignments')
    .select('shift_instance_id')
    .in('shift_instance_id', shiftIds)
    .neq('status', 'cancelled')

  if (assignErr) throw new Error(`assignments: ${assignErr.message}`)

  const filledCount = new Map<string, number>()
  for (const a of assignments ?? []) {
    filledCount.set(a.shift_instance_id, (filledCount.get(a.shift_instance_id) ?? 0) + 1)
  }

  const gaps: UnresolvableGap[] = []
  for (const s of shifts) {
    if (s.shift_type === 'ado') continue
    const required = (s.template_id ? templates.get(s.template_id) : null) ?? 1
    const filled = filledCount.get(s.id) ?? 0
    if (filled < required) {
      gaps.push({
        shiftInstanceId: s.id,
        areaName: areaNames.get(s.area_id) ?? 'Unknown',
        date: s.shift_date,
        shiftType: s.shift_type,
        required,
        filled,
      })
    }
  }

  gaps.sort((a, b) => a.date.localeCompare(b.date) || a.areaName.localeCompare(b.areaName))
  return gaps
}
