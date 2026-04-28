import type { Rule, Violation } from './types'

export const availabilityRule: Rule = (ctx) => {
  const violations: Violation[] = []

  if (ctx.availability.length === 0) return violations

  // Build a map of day_of_week → available
  const availMap = new Map(ctx.availability.map(a => [a.day_of_week, a.available]))

  for (const assignment of ctx.assignments) {
    const si = assignment.shift_instance
    const date = new Date(si.shift_date)
    const dow = date.getDay() // 0=Sun … 6=Sat

    const available = availMap.get(dow)
    // Only flag if explicitly marked unavailable (undefined = not configured = no constraint)
    if (available === false) {
      const dayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dow]
      violations.push({
        rule: 'availability',
        severity: 'warning',
        message: `${ctx.staff.full_name} is marked unavailable on ${dayName}s but is rostered on ${si.shift_date}.`,
        staffId: ctx.staff.id,
        shiftInstanceId: si.id,
      })
    }
  }

  return violations
}
