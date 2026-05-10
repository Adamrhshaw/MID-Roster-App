import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  Area,
  LeaveRequest,
  ShiftInstance,
  ShiftTemplate,
  Staff,
  StaffArea,
  StaffAvailability,
} from '@/types/database'
import { applyLeaveOverlay } from './leaveOverlay'
import { fillGaps } from './fillGaps'
import { scheduleAdo, type ScheduledAdo } from './scheduleAdo'
import type { GenerationReport, GeneratorContext, WorkingAssignment } from './types'

export type { GenerationReport, UnresolvableGap } from './types'

/**
 * Generate a draft roster for the given block.
 *
 * Phases:
 *   1. Template expansion — already done at block creation; we only re-load.
 *   2. Wipe previously generated assignments (preserve manual + swap).
 *   3. Leave overlay — cancel surviving assignments overlapping approved leave.
 *   4. Greedy gap fill — assign eligible staff to under-filled shifts.
 *   4b. ADO scheduling — release staff with ≥480 min accrual on a low-impact day.
 *   5. Persist + return report.
 */
export async function generateRoster(
  supabase: SupabaseClient,
  blockId: string
): Promise<GenerationReport> {
  // Phase 0/1 — clear previous generated assignments (manual/swap stay put).
  // The JS client doesn't support subqueries; first fetch shift IDs for this block.
  const { data: shiftIdRows, error: shiftIdErr } = await supabase
    .from('shift_instances')
    .select('id')
    .eq('roster_block_id', blockId)
  if (shiftIdErr) throw new Error(`Failed to read shift instances: ${shiftIdErr.message}`)

  const shiftIdsForWipe = (shiftIdRows ?? []).map(r => r.id)
  if (shiftIdsForWipe.length > 0) {
    const { error: wipeErr } = await supabase
      .from('assignments')
      .delete()
      .eq('source', 'generated')
      .in('shift_instance_id', shiftIdsForWipe)
    if (wipeErr) throw new Error(`Failed to wipe generated assignments: ${wipeErr.message}`)
  }

  // Load fresh context
  const ctx = await loadContext(supabase, blockId)

  // Phase 2 — leave overlay
  const cancelledByLeave = applyLeaveOverlay(ctx)

  // Phase 3 + 4 — gap detection + greedy fill (interleaved)
  const fillResult = fillGaps(ctx)

  // Phase 4b — ADO scheduling
  const adoResult = scheduleAdo(ctx)

  // Phase 5 — persist results
  await persistResults(supabase, blockId, ctx, adoResult.records)

  const preservedManual = ctx.assignments.filter(
    a => (a.source === 'manual' || a.source === 'swap') && a.status !== 'cancelled'
  ).length

  return {
    filledCount: fillResult.filledCount,
    unresolvableGaps: fillResult.unresolvableGaps,
    preservedManualAssignments: preservedManual,
    cancelledByLeave,
    adoScheduled: adoResult.scheduled,
    adoDeferred: adoResult.deferred,
  }
}

async function loadContext(
  supabase: SupabaseClient,
  blockId: string
): Promise<GeneratorContext> {
  const [
    blockRes,
    shiftsRes,
    templatesRes,
    staffRes,
    areasRes,
    staffAreasRes,
    availabilityRes,
  ] = await Promise.all([
    supabase
      .from('roster_blocks')
      .select('id, start_date, end_date')
      .eq('id', blockId)
      .single(),
    supabase
      .from('shift_instances')
      .select('id, roster_block_id, template_id, area_id, shift_type, shift_date, start_time, end_time, status')
      .eq('roster_block_id', blockId)
      .order('shift_date')
      .order('start_time'),
    supabase
      .from('shift_templates')
      .select('id, area_id, shift_type, start_time, end_time, ado_accrual_minutes, day_of_week, required_staff, is_active')
      .eq('is_active', true),
    supabase
      .from('staff')
      .select('id, full_name, employee_id, fte_target, is_active, email, phone, created_at')
      .eq('is_active', true),
    supabase
      .from('areas')
      .select('id, name, min_staff_per_shift, created_at'),
    supabase
      .from('staff_areas')
      .select('staff_id, area_id, is_primary'),
    supabase
      .from('staff_availability')
      .select('staff_id, day_of_week, available, notes'),
  ])

  if (blockRes.error || !blockRes.data) {
    throw new Error(`Block ${blockId} not found: ${blockRes.error?.message ?? 'no data'}`)
  }
  if (shiftsRes.error) throw new Error(`shifts: ${shiftsRes.error.message}`)
  if (templatesRes.error) throw new Error(`templates: ${templatesRes.error.message}`)
  if (staffRes.error) throw new Error(`staff: ${staffRes.error.message}`)
  if (areasRes.error) throw new Error(`areas: ${areasRes.error.message}`)
  if (staffAreasRes.error) throw new Error(`staff_areas: ${staffAreasRes.error.message}`)
  if (availabilityRes.error) throw new Error(`availability: ${availabilityRes.error.message}`)

  const block = blockRes.data
  const shifts = (shiftsRes.data ?? []) as ShiftInstance[]
  const templates = (templatesRes.data ?? []) as ShiftTemplate[]
  const staff = (staffRes.data ?? []) as Staff[]
  const areas = (areasRes.data ?? []) as Area[]
  const staffAreas = (staffAreasRes.data ?? []) as StaffArea[]
  const staffAvailability = (availabilityRes.data ?? []) as StaffAvailability[]

  // Approved leave requests overlapping this block
  const staffIds = staff.map(s => s.id)
  let leaveRequests: LeaveRequest[] = []
  if (staffIds.length > 0) {
    const leaveRes = await supabase
      .from('leave_requests')
      .select('id, staff_id, leave_type, start_date, end_date, notes, status, submitted_via, reviewed_by, created_at, updated_at')
      .in('staff_id', staffIds)
      .eq('status', 'approved')
      .lte('start_date', block.end_date)
      .gte('end_date', block.start_date)
    if (leaveRes.error) throw new Error(`leave: ${leaveRes.error.message}`)
    leaveRequests = (leaveRes.data ?? []) as LeaveRequest[]
  }

  // Surviving assignments after the wipe — these are the manual/swap assignments
  // (and possibly some cancelled rows) that we must preserve and reason about.
  const shiftIds = shifts.map(s => s.id)
  let assignments: WorkingAssignment[] = []
  if (shiftIds.length > 0) {
    const assignRes = await supabase
      .from('assignments')
      .select('shift_instance_id, staff_id, status, source')
      .in('shift_instance_id', shiftIds)
    if (assignRes.error) throw new Error(`assignments: ${assignRes.error.message}`)
    assignments = (assignRes.data ?? []).map(a => ({
      shift_instance_id: a.shift_instance_id,
      staff_id: a.staff_id,
      status: a.status,
      source: a.source,
    }))
  }

  // Map shift_instance_id → required_staff via template
  const tmplMap = new Map(templates.map(t => [t.id, t]))
  const shiftRequiredStaff = new Map<string, number>()
  for (const shift of shifts) {
    const tmpl = shift.template_id ? tmplMap.get(shift.template_id) : null
    shiftRequiredStaff.set(shift.id, tmpl?.required_staff ?? 1)
  }

  return {
    block,
    shifts,
    shiftRequiredStaff,
    templates,
    staff,
    staffAreas,
    staffAvailability,
    leaveRequests,
    areas,
    assignments,
    newGenerated: [],
    toCancel: [],
  }
}

async function persistResults(
  supabase: SupabaseClient,
  blockId: string,
  ctx: GeneratorContext,
  adoRecords: ScheduledAdo[]
): Promise<void> {
  // 1. Insert newly generated assignments
  if (ctx.newGenerated.length > 0) {
    const rows = ctx.newGenerated.map(a => ({
      shift_instance_id: a.shift_instance_id,
      staff_id: a.staff_id,
      status: a.status,
      source: a.source,
    }))
    const { error } = await supabase.from('assignments').insert(rows)
    if (error) throw new Error(`Insert generated assignments: ${error.message}`)
  }

  // 2. Cancel assignments flagged by leave overlay or ADO scheduling.
  //    Each (shift_instance_id, staff_id) pair is unique so we update them individually.
  for (const c of ctx.toCancel) {
    const { error } = await supabase
      .from('assignments')
      .update({ status: 'cancelled' })
      .eq('shift_instance_id', c.shift_instance_id)
      .eq('staff_id', c.staff_id)
    if (error) throw new Error(`Cancel assignment: ${error.message}`)
  }

  // 3. Upsert ado_accruals (one row per staff per block — UNIQUE constraint is (staff_id, roster_block_id))
  if (adoRecords.length > 0) {
    const rows = adoRecords.map(r => ({
      staff_id: r.staffId,
      roster_block_id: r.blockId,
      accrual_minutes: r.accrualMinutes,
      ado_day_date: r.adoDayDate,
    }))
    const { error } = await supabase
      .from('ado_accruals')
      .upsert(rows, { onConflict: 'staff_id,roster_block_id' })
    if (error) throw new Error(`Upsert ado_accruals: ${error.message}`)
  }

  // 4. Stamp the block's generated_at timestamp
  const { error: blockErr } = await supabase
    .from('roster_blocks')
    .update({ generated_at: new Date().toISOString() })
    .eq('id', blockId)
  if (blockErr) throw new Error(`Update generated_at: ${blockErr.message}`)
}
