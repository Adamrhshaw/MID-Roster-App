import type { ShiftInstance } from '@/types/database'
import type { GeneratorContext } from './types'

export interface Gap {
  shift: ShiftInstance
  required: number
  filled: number
  missing: number
  // Lower number = higher priority. Used for stable ordering.
  priorityKey: number
}

const SHIFT_PRIORITY: Record<string, number> = {
  // Night shifts are hardest to fill, so prioritise them first.
  night: 0,
  morning: 1,
  afternoon: 2,
  ado: 9,
}

/**
 * Phase 3 — Gap detection.
 *
 * Scans the current working state and returns shifts where the count of non-cancelled
 * assignments is below the template's required_staff. Sorted by priority:
 *   1. Shifts already below area.min_staff_per_shift (safety critical first)
 *   2. Earlier dates before later dates
 *   3. Night before morning before afternoon (harder to fill first)
 */
export function detectGaps(ctx: GeneratorContext): Gap[] {
  const areaMinByArea = new Map(ctx.areas.map(a => [a.id, a.min_staff_per_shift]))

  // Count non-cancelled assignments per shift_instance
  const filledCount = new Map<string, number>()
  for (const a of ctx.assignments) {
    if (a.status === 'cancelled') continue
    filledCount.set(a.shift_instance_id, (filledCount.get(a.shift_instance_id) ?? 0) + 1)
  }

  const gaps: Gap[] = []
  for (const shift of ctx.shifts) {
    const required = ctx.shiftRequiredStaff.get(shift.id) ?? 0
    const filled = filledCount.get(shift.id) ?? 0
    if (filled >= required) continue

    const areaMin = areaMinByArea.get(shift.area_id) ?? 0
    // Safety-critical shifts (below area minimum) get the lowest priority key (sort first).
    const safetyKey = filled < areaMin ? 0 : 1

    gaps.push({
      shift,
      required,
      filled,
      missing: required - filled,
      priorityKey: safetyKey,
    })
  }

  gaps.sort((a, b) => {
    if (a.priorityKey !== b.priorityKey) return a.priorityKey - b.priorityKey
    if (a.shift.shift_date !== b.shift.shift_date) {
      return a.shift.shift_date < b.shift.shift_date ? -1 : 1
    }
    const aShiftRank = SHIFT_PRIORITY[a.shift.shift_type] ?? 5
    const bShiftRank = SHIFT_PRIORITY[b.shift.shift_type] ?? 5
    return aShiftRank - bShiftRank
  })

  return gaps
}
