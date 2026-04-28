import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  const { blockId } = await params
  const supabase = createServiceClient()

  const [
    { data: block, error: blockErr },
    { data: shifts, error: shiftsErr },
    { data: staff, error: staffErr },
    { data: areas, error: areasErr },
  ] = await Promise.all([
    supabase
      .from('roster_blocks')
      .select('id, name, start_date, end_date, status')
      .eq('id', blockId)
      .single(),
    supabase
      .from('shift_instances')
      .select('id, area_id, shift_type, shift_date, start_time, end_time, status')
      .eq('roster_block_id', blockId)
      .order('shift_date')
      .order('start_time'),
    supabase
      .from('staff')
      .select('id, full_name, employee_id, primary_area_id, fte_target')
      .eq('is_active', true)
      .order('full_name'),
    supabase
      .from('areas')
      .select('id, name, min_staff_per_shift')
      .order('name'),
  ])

  if (blockErr) return NextResponse.json({ error: blockErr.message }, { status: 404 })
  if (shiftsErr) return NextResponse.json({ error: shiftsErr.message }, { status: 500 })
  if (staffErr) return NextResponse.json({ error: staffErr.message }, { status: 500 })
  if (areasErr) return NextResponse.json({ error: areasErr.message }, { status: 500 })

  // Load assignments for all shift instances in one query
  const shiftIds = (shifts ?? []).map(s => s.id)
  const { data: assignments, error: assignErr } = shiftIds.length > 0
    ? await supabase
        .from('assignments')
        .select('id, shift_instance_id, staff_id, status, source')
        .in('shift_instance_id', shiftIds)
        .neq('status', 'cancelled')
    : { data: [], error: null }

  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 })

  return NextResponse.json({
    block,
    areas: areas ?? [],
    staff: staff ?? [],
    shifts: shifts ?? [],
    assignments: assignments ?? [],
  })
}
