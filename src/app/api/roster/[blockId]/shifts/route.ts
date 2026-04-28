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
      .select('id, full_name, employee_id, fte_target, is_active, email, phone, created_at')
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

  const shiftIds = (shifts ?? []).map(s => s.id)
  const staffIds = (staff ?? []).map(s => s.id)

  // Load assignments, leave requests, and availability in parallel
  const [
    { data: assignments, error: assignErr },
    { data: leaveRequests, error: leaveErr },
    { data: availability, error: availErr },
  ] = await Promise.all([
    shiftIds.length > 0
      ? supabase
          .from('assignments')
          .select('id, shift_instance_id, staff_id, status, source, created_at, updated_at')
          .in('shift_instance_id', shiftIds)
          .neq('status', 'cancelled')
      : Promise.resolve({ data: [], error: null }),
    staffIds.length > 0
      ? supabase
          .from('leave_requests')
          .select('id, staff_id, leave_type, start_date, end_date, notes, status, submitted_via, reviewed_by, created_at, updated_at')
          .in('staff_id', staffIds)
          .eq('status', 'approved')
          .lte('start_date', block!.end_date)
          .gte('end_date', block!.start_date)
      : Promise.resolve({ data: [], error: null }),
    staffIds.length > 0
      ? supabase
          .from('staff_availability')
          .select('staff_id, day_of_week, available, notes')
          .in('staff_id', staffIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 })
  if (leaveErr) return NextResponse.json({ error: leaveErr.message }, { status: 500 })
  if (availErr) return NextResponse.json({ error: availErr.message }, { status: 500 })

  // Enrich assignments with their shift_instance for the rules engine
  const shiftMap = new Map((shifts ?? []).map(s => [s.id, s]))
  const richAssignments = (assignments ?? []).map(a => ({
    ...a,
    shift_instance: shiftMap.get(a.shift_instance_id)!,
  })).filter(a => a.shift_instance)

  return NextResponse.json({
    block,
    areas: areas ?? [],
    staff: staff ?? [],
    shifts: shifts ?? [],
    assignments: richAssignments,
    leaveRequests: leaveRequests ?? [],
    availability: availability ?? [],
  })
}
