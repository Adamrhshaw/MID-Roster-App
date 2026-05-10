import type { ShiftInstance, Staff } from '@/types/database'
import { detectGaps, type Gap } from './detectGaps'
import type { GeneratorContext, UnresolvableGap, WorkingAssignment } from './types'

const STANDARD_WEEKLY_HOURS = 35
const MINIMUM_REST_MINUTES = 10 * 60

interface FillResult {
  filledCount: number
  unresolvableGaps: UnresolvableGap[]
}

/**
 * Phase 4 — Greedy gap fill.
 *
 * For each detected gap, build a candidate list of eligible staff (passing all hard
 * constraints), then pick the candidate with the fewest hours assigned in the block
 * (fairness). Repeat until all gaps are filled or no candidates remain.
 *
 * Rules respected as HARD constraints (stricter than the warning-only UI rules):
 *   - staff is in staff_areas for the shift's area
 *   - no approved leave on shift_date
 *   - staff_availability for that day-of-week is not explicitly false
 *   - 10h minimum rest from neighbouring assigned shifts
 *   - assignment would not exceed fte_target × 35h in that ISO week
 *   - staff is not already assigned (or previously cancelled) for this shift_instance
 *   - staff has no other non-cancelled assignment on the same calendar date
 */
export function fillGaps(ctx: GeneratorContext): FillResult {
  const result: FillResult = { filledCount: 0, unresolvableGaps: [] }

  // Detect gaps once at the start; mutate ctx.assignments and re-detect after each pass
  // is correct but expensive. Since each fill changes only one shift's filled count, we
  // recompute the gap list each time we fully drain it for one shift to ensure ordering
  // remains correct as priorities shift. Simplest approach: process in initial-priority
  // order, fill until each shift is satisfied, then re-detect for any newly-uncovered.
  let pass = 0
  while (pass < 10) {
    pass++
    const gaps = detectGaps(ctx)
    if (gaps.length === 0) break

    let madeProgress = false
    for (const gap of gaps) {
      // Re-check missing count using current ctx state in case earlier picks filled this shift
      const currentFilled = countFilled(ctx, gap.shift.id)
      const stillMissing = gap.required - currentFilled
      if (stillMissing <= 0) continue

      let filledThisGap = 0
      for (let i = 0; i < stillMissing; i++) {
        const candidate = pickCandidate(ctx, gap.shift)
        if (!candidate) break
        assignStaff(ctx, gap.shift, candidate)
        filledThisGap++
        result.filledCount++
        madeProgress = true
      }

      if (filledThisGap < stillMissing) {
        result.unresolvableGaps.push(buildUnresolvable(ctx, gap, currentFilled + filledThisGap))
      }
    }

    if (!madeProgress) break
  }

  // De-duplicate unresolvable gaps (a shift could be reported in multiple passes)
  const seen = new Set<string>()
  result.unresolvableGaps = result.unresolvableGaps.filter(g => {
    if (seen.has(g.shiftInstanceId)) return false
    seen.add(g.shiftInstanceId)
    return true
  })

  return result
}

function buildUnresolvable(ctx: GeneratorContext, gap: Gap, finalFilled: number): UnresolvableGap {
  const area = ctx.areas.find(a => a.id === gap.shift.area_id)
  return {
    shiftInstanceId: gap.shift.id,
    areaName: area?.name ?? gap.shift.area_id,
    date: gap.shift.shift_date,
    shiftType: gap.shift.shift_type,
    required: gap.required,
    filled: finalFilled,
  }
}

function countFilled(ctx: GeneratorContext, shiftInstanceId: string): number {
  let count = 0
  for (const a of ctx.assignments) {
    if (a.shift_instance_id === shiftInstanceId && a.status !== 'cancelled') count++
  }
  return count
}

function assignStaff(ctx: GeneratorContext, shift: ShiftInstance, staff: Staff): void {
  const newAssignment: WorkingAssignment = {
    shift_instance_id: shift.id,
    staff_id: staff.id,
    status: 'draft',
    source: 'generated',
  }
  ctx.assignments.push(newAssignment)
  ctx.newGenerated.push(newAssignment)
}

/** Pick the best eligible candidate for the given shift — null if no eligible staff. */
function pickCandidate(ctx: GeneratorContext, shift: ShiftInstance): Staff | null {
  const eligible = ctx.staff.filter(s => isEligible(ctx, s, shift))
  if (eligible.length === 0) return null

  eligible.sort((a, b) => {
    // Primary: ascending hours assigned this block (fairness)
    const aHours = hoursAssignedInBlock(ctx, a.id)
    const bHours = hoursAssignedInBlock(ctx, b.id)
    if (aHours !== bHours) return aHours - bHours
    // Secondary: descending fte_target so full-timers absorb extra hours when tied
    if (a.fte_target !== b.fte_target) return b.fte_target - a.fte_target
    // Tertiary: stable by full_name
    return a.full_name.localeCompare(b.full_name)
  })

  return eligible[0]
}

function isEligible(ctx: GeneratorContext, staff: Staff, shift: ShiftInstance): boolean {
  // 1. Staff must be eligible for the area (staff_areas join)
  const inArea = ctx.staffAreas.some(sa => sa.staff_id === staff.id && sa.area_id === shift.area_id)
  if (!inArea) return false

  // 2. Staff must not already have any record (cancelled or not) for this shift — UNIQUE constraint
  const existing = ctx.assignments.find(
    a => a.shift_instance_id === shift.id && a.staff_id === staff.id
  )
  if (existing) return false

  // 3. Staff must not already be on a non-cancelled assignment for the same calendar date
  const sameDay = ctx.assignments.some(a => {
    if (a.staff_id !== staff.id) return false
    if (a.status === 'cancelled') return false
    const otherShift = ctx.shifts.find(s => s.id === a.shift_instance_id)
    return otherShift?.shift_date === shift.shift_date
  })
  if (sameDay) return false

  // 4. No approved leave on this shift's date
  const onLeave = ctx.leaveRequests.some(l =>
    l.staff_id === staff.id && shift.shift_date >= l.start_date && shift.shift_date <= l.end_date
  )
  if (onLeave) return false

  // 5. Day-of-week availability — only blocks if explicitly marked unavailable
  // staff_availability uses 0=Sun…6=Sat (matches getDay) — see availabilityRule.ts
  const dow = new Date(shift.shift_date + 'T00:00:00').getDay()
  const avail = ctx.staffAvailability.find(
    a => a.staff_id === staff.id && a.day_of_week === dow
  )
  if (avail && avail.available === false) return false

  // 6. Minimum 10h rest from neighbouring shifts (and no overlap)
  if (!meetsRestPeriod(ctx, staff, shift)) return false

  // 7. Adding this shift must not push staff over fte_target × 35h in its ISO week
  if (!withinFteForWeek(ctx, staff, shift)) return false

  return true
}

/** Sum of duration_hours of all non-cancelled assignments for staff in this block. */
function hoursAssignedInBlock(ctx: GeneratorContext, staffId: string): number {
  let total = 0
  for (const a of ctx.assignments) {
    if (a.staff_id !== staffId) continue
    if (a.status === 'cancelled') continue
    const shift = ctx.shifts.find(s => s.id === a.shift_instance_id)
    if (!shift) continue
    total += shiftDurationHours(shift)
  }
  return total
}

function shiftStartMs(date: string, startTime: string): number {
  return new Date(`${date}T${startTime}`).getTime()
}

function shiftEndMs(date: string, startTime: string, endTime: string): number {
  const start = shiftStartMs(date, startTime)
  let end = new Date(`${date}T${endTime}`).getTime()
  if (end <= start) end += 24 * 60 * 60 * 1000
  return end
}

function shiftDurationHours(shift: ShiftInstance): number {
  const start = shiftStartMs(shift.shift_date, shift.start_time)
  const end = shiftEndMs(shift.shift_date, shift.start_time, shift.end_time)
  return (end - start) / 3_600_000
}

function meetsRestPeriod(ctx: GeneratorContext, staff: Staff, candidate: ShiftInstance): boolean {
  const candStart = shiftStartMs(candidate.shift_date, candidate.start_time)
  const candEnd = shiftEndMs(candidate.shift_date, candidate.start_time, candidate.end_time)

  for (const a of ctx.assignments) {
    if (a.staff_id !== staff.id) continue
    if (a.status === 'cancelled') continue
    const other = ctx.shifts.find(s => s.id === a.shift_instance_id)
    if (!other) continue

    const otherStart = shiftStartMs(other.shift_date, other.start_time)
    const otherEnd = shiftEndMs(other.shift_date, other.start_time, other.end_time)

    // Overlap check
    if (candStart < otherEnd && otherStart < candEnd) return false

    // Rest check — if other ends before candidate starts
    if (otherEnd <= candStart) {
      const restMin = (candStart - otherEnd) / 60_000
      if (restMin < MINIMUM_REST_MINUTES) return false
    }
    // ...or candidate ends before other starts
    if (candEnd <= otherStart) {
      const restMin = (otherStart - candEnd) / 60_000
      if (restMin < MINIMUM_REST_MINUTES) return false
    }
  }
  return true
}

function isoWeekKey(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  const thursday = new Date(date)
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3)
  const yearStart = new Date(thursday.getFullYear(), 0, 1)
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`
}

function withinFteForWeek(ctx: GeneratorContext, staff: Staff, candidate: ShiftInstance): boolean {
  const targetHours = staff.fte_target * STANDARD_WEEKLY_HOURS
  const candidateWeek = isoWeekKey(candidate.shift_date)

  let weekHours = 0
  for (const a of ctx.assignments) {
    if (a.staff_id !== staff.id) continue
    if (a.status === 'cancelled') continue
    const other = ctx.shifts.find(s => s.id === a.shift_instance_id)
    if (!other) continue
    if (isoWeekKey(other.shift_date) !== candidateWeek) continue
    weekHours += shiftDurationHours(other)
  }

  const candidateHours = shiftDurationHours(candidate)
  return weekHours + candidateHours <= targetHours
}
