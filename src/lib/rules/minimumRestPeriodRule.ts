import type { Rule, Violation } from './types'

const MINIMUM_REST_MINUTES = 10 * 60 // 10 hours

function shiftEndMs(date: string, endTime: string): number {
  // Night shifts end at 00:00 — treat as next calendar day
  if (endTime === '00:00:00' || endTime === '00:00') {
    const d = new Date(`${date}T00:00:00`)
    d.setDate(d.getDate() + 1)
    return d.getTime()
  }
  return new Date(`${date}T${endTime}`).getTime()
}

function shiftStartMs(date: string, startTime: string): number {
  return new Date(`${date}T${startTime}`).getTime()
}

export const minimumRestPeriodRule: Rule = (ctx) => {
  const violations: Violation[] = []

  // Sort assignments chronologically by shift start
  const sorted = [...ctx.assignments].sort((a, b) => {
    const aStart = shiftStartMs(a.shift_instance.shift_date, a.shift_instance.start_time)
    const bStart = shiftStartMs(b.shift_instance.shift_date, b.shift_instance.start_time)
    return aStart - bStart
  })

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i]
    const next = sorted[i + 1]

    const endMs = shiftEndMs(current.shift_instance.shift_date, current.shift_instance.end_time)
    const nextStartMs = shiftStartMs(next.shift_instance.shift_date, next.shift_instance.start_time)
    const restMinutes = (nextStartMs - endMs) / 60_000

    if (restMinutes < MINIMUM_REST_MINUTES) {
      violations.push({
        rule: 'minimumRestPeriod',
        severity: 'warning',
        message: `Only ${Math.round(restMinutes / 60 * 10) / 10}h rest between shifts on ${current.shift_instance.shift_date} and ${next.shift_instance.shift_date} (minimum 10h).`,
        staffId: ctx.staff.id,
        shiftInstanceId: next.shift_instance.id,
      })
    }
  }

  return violations
}
