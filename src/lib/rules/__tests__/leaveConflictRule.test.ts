import { describe, it, expect } from 'vitest'
import { leaveConflictRule } from '../leaveConflictRule'
import { makeAssignment, makeContext, makeLeaveRequest, makeShiftInstance, STAFF_ALICE } from './fixtures'

describe('leaveConflictRule', () => {
  it('flags a shift that falls within approved leave', () => {
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-13' })
    const leave = makeLeaveRequest({ id: 'leave-1', staff_id: STAFF_ALICE.id, start_date: '2026-05-12', end_date: '2026-05-16', status: 'approved' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)], { leaveRequests: [leave] })
    const violations = leaveConflictRule(ctx)
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('leaveConflict')
    expect(violations[0].shiftInstanceId).toBe('si-1')
  })

  it('does not flag shifts outside leave period', () => {
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-19' })
    const leave = makeLeaveRequest({ id: 'leave-1', staff_id: STAFF_ALICE.id, start_date: '2026-05-12', end_date: '2026-05-16', status: 'approved' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)], { leaveRequests: [leave] })
    expect(leaveConflictRule(ctx)).toHaveLength(0)
  })

  it('does not flag pending leave (only approved triggers conflict)', () => {
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-13' })
    const leave = makeLeaveRequest({ id: 'leave-1', staff_id: STAFF_ALICE.id, start_date: '2026-05-12', end_date: '2026-05-16', status: 'pending' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)], { leaveRequests: [leave] })
    expect(leaveConflictRule(ctx)).toHaveLength(0)
  })

  it('flags shift on exact start date of leave', () => {
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-12' })
    const leave = makeLeaveRequest({ id: 'leave-1', staff_id: STAFF_ALICE.id, start_date: '2026-05-12', end_date: '2026-05-16', status: 'approved' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)], { leaveRequests: [leave] })
    expect(leaveConflictRule(ctx)).toHaveLength(1)
  })

  it('flags shift on exact end date of leave', () => {
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-16' })
    const leave = makeLeaveRequest({ id: 'leave-1', staff_id: STAFF_ALICE.id, start_date: '2026-05-12', end_date: '2026-05-16', status: 'approved' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)], { leaveRequests: [leave] })
    expect(leaveConflictRule(ctx)).toHaveLength(1)
  })

  it('returns no violations with no leave requests', () => {
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-13' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)])
    expect(leaveConflictRule(ctx)).toHaveLength(0)
  })
})
