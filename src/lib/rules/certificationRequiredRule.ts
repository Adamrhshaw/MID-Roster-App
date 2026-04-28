import type { Rule, Violation } from './types'

// Staff areas represent the modalities a staff member is certified for.
// Flag if a staff member is assigned to a shift in an area not in their staff_areas list.
export const certificationRequiredRule: Rule = (ctx) => {
  const violations: Violation[] = []

  const certifiedAreaIds = new Set(ctx.staff.areas?.map(a => a.id) ?? [])
  // If no areas configured, skip — constraint not set up yet
  if (certifiedAreaIds.size === 0) return violations

  for (const assignment of ctx.assignments) {
    const si = assignment.shift_instance
    if (!certifiedAreaIds.has(si.area_id)) {
      const areaName = si.area?.name ?? si.area_id
      violations.push({
        rule: 'certificationRequired',
        severity: 'warning',
        message: `${ctx.staff.full_name} is not certified for ${areaName} but is rostered there on ${si.shift_date}.`,
        staffId: ctx.staff.id,
        shiftInstanceId: si.id,
      })
    }
  }

  return violations
}
