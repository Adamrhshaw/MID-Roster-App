import type { ShiftInstance } from '@/types/database'
import type { GeneratorContext } from './types'

const ADO_ACCRUAL_PER_SHIFT = 22 // minutes
const ADO_DAY_THRESHOLD = 480 // minutes (~8h paid day off)

export interface ScheduledAdo {
  staffId: string
  blockId: string
  accrualMinutes: number // remaining after this block (carry-forward residual)
  adoDayDate: string | null
}

interface ScheduleAdoResult {
  scheduled: number
  deferred: number
  records: ScheduledAdo[]
}

/**
 * Phase 4b — ADO (Accrued Day Off) scheduling.
 *
 * Each rostered shift accrues 22 minutes toward an ADO. After ~22 shifts the staff
 * member has accumulated ≥480 minutes (one paid day off).
 *
 * For staff with ≥1 ADO due, try to schedule it inside this block by cancelling
 * one of their rostered shifts on a day where coverage stays at-or-above the area
 * minimum without them. If no eligible day exists, defer — the full accrual carries
 * forward via ado_accruals.accrual_minutes.
 *
 * Mutates ctx (cancels the scheduled assignment) and returns ado_accruals records
 * for the orchestrator to persist.
 */
export function scheduleAdo(ctx: GeneratorContext): ScheduleAdoResult {
  const result: ScheduleAdoResult = { scheduled: 0, deferred: 0, records: [] }

  const areaMinByArea = new Map(ctx.areas.map(a => [a.id, a.min_staff_per_shift]))

  // Process staff in descending order of accrued minutes so the most-eligible go first
  // (matches DESIGN.md EC-5b: schedule one at a time, recheck coverage after each).
  const staffSorted = [...ctx.staff].sort((a, b) => {
    const aMin = countWorkingShifts(ctx, a.id) * ADO_ACCRUAL_PER_SHIFT
    const bMin = countWorkingShifts(ctx, b.id) * ADO_ACCRUAL_PER_SHIFT
    return bMin - aMin
  })

  for (const staff of staffSorted) {
    const workingShifts = countWorkingShifts(ctx, staff.id)
    const accruedMinutes = workingShifts * ADO_ACCRUAL_PER_SHIFT

    if (accruedMinutes < ADO_DAY_THRESHOLD) {
      // Below threshold — just record carry-forward.
      result.records.push({
        staffId: staff.id,
        blockId: ctx.block.id,
        accrualMinutes: accruedMinutes,
        adoDayDate: null,
      })
      continue
    }

    // Find the best day to release this staff member.
    const candidate = findAdoCandidateDay(ctx, staff.id, areaMinByArea)
    if (!candidate) {
      result.deferred++
      result.records.push({
        staffId: staff.id,
        blockId: ctx.block.id,
        accrualMinutes: accruedMinutes,
        adoDayDate: null,
      })
      continue
    }

    // Cancel the assignment for that day so coverage truly drops by one (already
    // verified above-min after removal), then record the ADO.
    const assignment = ctx.assignments.find(
      a => a.staff_id === staff.id
        && a.shift_instance_id === candidate.id
        && a.status !== 'cancelled'
    )
    if (assignment) {
      assignment.status = 'cancelled'
      ctx.toCancel.push({
        shift_instance_id: assignment.shift_instance_id,
        staff_id: assignment.staff_id,
      })
    }

    result.scheduled++
    result.records.push({
      staffId: staff.id,
      blockId: ctx.block.id,
      // Carry forward any residual past the 480-min threshold
      accrualMinutes: accruedMinutes - ADO_DAY_THRESHOLD,
      adoDayDate: candidate.shift_date,
    })
  }

  return result
}

function countWorkingShifts(ctx: GeneratorContext, staffId: string): number {
  let count = 0
  for (const a of ctx.assignments) {
    if (a.staff_id !== staffId) continue
    if (a.status === 'cancelled') continue
    const shift = ctx.shifts.find(s => s.id === a.shift_instance_id)
    if (!shift) continue
    if (shift.shift_type === 'ado') continue
    count++
  }
  return count
}

/**
 * Find a shift the staff member is currently assigned to, where removing them
 * keeps the area at-or-above its minimum staffing. Prefers later dates so the staff
 * member accrues maximum minutes before taking the day off.
 */
function findAdoCandidateDay(
  ctx: GeneratorContext,
  staffId: string,
  areaMinByArea: Map<string, number>
): ShiftInstance | null {
  // Build map of current filled count per shift_instance
  const filledCount = new Map<string, number>()
  for (const a of ctx.assignments) {
    if (a.status === 'cancelled') continue
    filledCount.set(a.shift_instance_id, (filledCount.get(a.shift_instance_id) ?? 0) + 1)
  }

  const eligibleShifts: ShiftInstance[] = []
  for (const a of ctx.assignments) {
    if (a.staff_id !== staffId) continue
    if (a.status === 'cancelled') continue
    const shift = ctx.shifts.find(s => s.id === a.shift_instance_id)
    if (!shift) continue
    if (shift.shift_type === 'ado') continue

    const currentFilled = filledCount.get(shift.id) ?? 0
    const areaMin = areaMinByArea.get(shift.area_id) ?? 0
    // Removing this staff would drop count by 1; check the result is still at-or-above min
    if (currentFilled - 1 >= areaMin) eligibleShifts.push(shift)
  }

  if (eligibleShifts.length === 0) return null

  // Prefer later dates (more accrual before the ADO), then earlier shift types
  eligibleShifts.sort((a, b) => {
    if (a.shift_date !== b.shift_date) return a.shift_date < b.shift_date ? 1 : -1
    return a.start_time.localeCompare(b.start_time)
  })

  return eligibleShifts[0]
}
