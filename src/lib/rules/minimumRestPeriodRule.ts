import type { Rule, Violation } from './types'
import { fmtDate } from './dateFormat'

const MINIMUM_REST_MINUTES = 10 * 60 // 10 hours

function shiftEndMs(date: string, startTime: string, endTime: string): number {
  const start = new Date(`${date}T${startTime}`).getTime()
  let end = new Date(`${date}T${endTime}`).getTime()
  // If end is at or before start the shift crosses midnight — push end to next day
  if (end <= start) end += 24 * 60 * 60 * 1000
  return end
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

    const endMs = shiftEndMs(current.shift_instance.shift_date, current.shift_instance.start_time, current.shift_instance.end_time)
    const nextStartMs = shiftStartMs(next.shift_instance.shift_date, next.shift_instance.start_time)
    const restMinutes = (nextStartMs - endMs) / 60_000

    if (restMinutes < MINIMUM_REST_MINUTES) {
      violations.push({
        rule: 'minimumRestPeriod',
        severity: 'warning',
        name: 'Short rest',
        message: `${Math.round(restMinutes / 60 * 10) / 10}h · ${fmtDate(current.shift_instance.shift_date)}–${fmtDate(next.shift_instance.shift_date)}`,
        staffId: ctx.staff.id,
        shiftInstanceId: next.shift_instance.id,
      })
    }
  }

  return violations
}
