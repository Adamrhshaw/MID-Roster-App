import type { GeneratorContext } from './types'

/**
 * Phase 2 — Leave overlay.
 *
 * For each surviving (manual/swap) assignment that overlaps an approved leave request,
 * mark the assignment as cancelled. The shift slot becomes available for Phase 4 to fill
 * with another staff member.
 *
 * Note: ctx.leaveRequests is pre-filtered to status='approved' and date-overlapping
 * the block, so we don't need to re-filter here.
 *
 * Returns the number of assignments cancelled.
 */
export function applyLeaveOverlay(ctx: GeneratorContext): number {
  if (ctx.leaveRequests.length === 0) return 0

  // Group leave by staff for O(1) lookup
  const leaveByStaff = new Map<string, typeof ctx.leaveRequests>()
  for (const leave of ctx.leaveRequests) {
    const arr = leaveByStaff.get(leave.staff_id) ?? []
    arr.push(leave)
    leaveByStaff.set(leave.staff_id, arr)
  }

  // Index shifts by id for date lookup
  const shiftMap = new Map(ctx.shifts.map(s => [s.id, s]))

  let cancelled = 0
  for (const assignment of ctx.assignments) {
    if (assignment.status === 'cancelled') continue

    const leaves = leaveByStaff.get(assignment.staff_id)
    if (!leaves) continue

    const shift = shiftMap.get(assignment.shift_instance_id)
    if (!shift) continue

    const shiftDate = shift.shift_date
    const conflict = leaves.some(l => shiftDate >= l.start_date && shiftDate <= l.end_date)
    if (!conflict) continue

    assignment.status = 'cancelled'
    ctx.toCancel.push({
      shift_instance_id: assignment.shift_instance_id,
      staff_id: assignment.staff_id,
    })
    cancelled++
  }

  return cancelled
}
