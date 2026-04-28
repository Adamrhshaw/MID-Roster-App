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

  // Group assignments by ISO week, sum hours
  const weekHours = new Map<string, number>()
  for (const a of ctx.assignments) {
    const si = a.shift_instance
    // ADO shifts don't count as worked hours
    if (si.shift_type === 'ado') continue

    const week = isoWeek(si.shift_date)
    const start = new Date(`${si.shift_date}T${si.start_time}`)
    let end = new Date(`${si.shift_date}T${si.end_time}`)
    // Night shift: end time 00:00 is next day
    if (end <= start) end.setDate(end.getDate() + 1)
    const hours = (end.getTime() - start.getTime()) / 3_600_000

    weekHours.set(week, (weekHours.get(week) ?? 0) + hours)
  }

  for (const [week, hours] of weekHours) {
    // Allow 10% tolerance to avoid floating-point noise
    if (hours > targetHours * 1.1) {
      violations.push({
        rule: 'maxWeeklyHours',
        severity: 'warning',
        message: `Week ${week}: ${hours.toFixed(1)}h rostered exceeds target of ${targetHours}h (FTE ${ctx.staff.fte_target}).`,
        staffId: ctx.staff.id,
      })
    }
  }

  return violations
}
