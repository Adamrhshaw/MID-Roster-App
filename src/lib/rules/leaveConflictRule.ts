import type { Rule, Violation } from './types'

export const leaveConflictRule: Rule = (ctx) => {
  const violations: Violation[] = []

  const approvedLeave = ctx.leaveRequests.filter(l => l.status === 'approved')
  if (approvedLeave.length === 0) return violations

  for (const assignment of ctx.assignments) {
    const shiftDate = assignment.shift_instance.shift_date

    for (const leave of approvedLeave) {
      if (shiftDate >= leave.start_date && shiftDate <= leave.end_date) {
        violations.push({
          rule: 'leaveConflict',
          severity: 'warning',
          message: `${ctx.staff.full_name} is rostered on ${shiftDate} but has approved ${leave.leave_type} leave (${leave.start_date}–${leave.end_date}).`,
          staffId: ctx.staff.id,
          shiftInstanceId: assignment.shift_instance.id,
        })
        break // one violation per assignment is enough
      }
    }
  }

  return violations
}
