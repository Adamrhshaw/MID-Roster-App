import type { Rule, Violation } from './types'

const STANDARD_WEEKLY_HOURS = 35

// Returns ISO week string "YYYY-Www" for grouping
function isoWeek(dateStr: string): string {
  const date = new Date(dateStr)
  const thursday = new Date(date)
  thursday.setDate(date.getDate() - ((date.getDay() + 6) % 7) + 3)
  const yearStart = new Date(thursday.getFullYear(), 0, 1)
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${thursday.getFullYear()}-W${String(week).padStart(2, '0')}`
}

export const maxWeeklyHoursRule: Rule = (ctx) => {
  const violations: Violation[] = []
  const targetHours = ctx.staff.fte_target * STANDARD_WEEKLY_HOURS

  // Group assignments by ISO week, sum hours and collect shift instances
  const weekData = new Map<string, { hours: number; shiftInstanceIds: string[] }>()
  for (const a of ctx.assignments) {
    const si = a.shift_instance
    if (si.shift_type === 'ado') continue

    const week = isoWeek(si.shift_date)
    const start = new Date(`${si.shift_date}T${si.start_time}`)
    let end = new Date(`${si.shift_date}T${si.end_time}`)
    if (end <= start) end.setDate(end.getDate() + 1)
    const hours = (end.getTime() - start.getTime()) / 3_600_000

    const prev = weekData.get(week)
    weekData.set(week, {
      hours: (prev?.hours ?? 0) + hours,
      shiftInstanceIds: [...(prev?.shiftInstanceIds ?? []), si.id],
    })
  }

  for (const [, { hours, shiftInstanceIds }] of weekData) {
    // Allow 10% tolerance to avoid floating-point noise
    if (hours > targetHours * 1.1) {
      for (const shiftInstanceId of shiftInstanceIds) {
        violations.push({
          rule: 'maxWeeklyHours',
          severity: 'warning',
          name: 'Over FTE',
          message: `${hours.toFixed(1)} / ${targetHours}h`,
          staffId: ctx.staff.id,
          shiftInstanceId,
        })
      }
    }
  }

  return violations
}
