import { describe, it, expect } from 'vitest'
import { applyLeaveOverlay } from '../leaveOverlay'
import { makeCtx, makeLeaveRequest, makeShift, wa, STAFF_ALICE, STAFF_BOB } from './fixtures'

describe('applyLeaveOverlay', () => {
  it('returns 0 and makes no changes when there are no leave requests', () => {
    const shift = makeShift('si-1', '2026-06-02')
    const ctx = makeCtx({
      shifts: [shift],
      assignments: [wa('si-1', STAFF_ALICE.id)],
    })
    expect(applyLeaveOverlay(ctx)).toBe(0)
    expect(ctx.assignments[0].status).toBe('draft')
    expect(ctx.toCancel).toHaveLength(0)
  })

  it('cancels a manual assignment that falls on a leave date', () => {
    const shift = makeShift('si-1', '2026-06-10')
    const ctx = makeCtx({
      shifts: [shift],
      assignments: [wa('si-1', STAFF_ALICE.id, 'manual', 'draft')],
      leaveRequests: [makeLeaveRequest(STAFF_ALICE.id, '2026-06-10', '2026-06-10')],
    })
    expect(applyLeaveOverlay(ctx)).toBe(1)
    expect(ctx.assignments[0].status).toBe('cancelled')
    expect(ctx.toCancel).toEqual([{ shift_instance_id: 'si-1', staff_id: STAFF_ALICE.id }])
  })

  it('cancels a swap assignment that falls within a multi-day leave range', () => {
    const shift = makeShift('si-1', '2026-06-10')
    const ctx = makeCtx({
      shifts: [shift],
      assignments: [wa('si-1', STAFF_ALICE.id, 'swap', 'confirmed')],
      leaveRequests: [makeLeaveRequest(STAFF_ALICE.id, '2026-06-09', '2026-06-11')],
    })
    expect(applyLeaveOverlay(ctx)).toBe(1)
    expect(ctx.assignments[0].status).toBe('cancelled')
  })

  it('skips assignments that are already cancelled — no double-cancel', () => {
    const shift = makeShift('si-1', '2026-06-10')
    const ctx = makeCtx({
      shifts: [shift],
      assignments: [wa('si-1', STAFF_ALICE.id, 'manual', 'cancelled')],
      leaveRequests: [makeLeaveRequest(STAFF_ALICE.id, '2026-06-10', '2026-06-10')],
    })
    expect(applyLeaveOverlay(ctx)).toBe(0)
    expect(ctx.toCancel).toHaveLength(0)
  })

  it('cancels only the staff member on leave, not others on the same shift', () => {
    const shift = makeShift('si-1', '2026-06-10')
    const ctx = makeCtx({
      shifts: [shift],
      assignments: [
        wa('si-1', STAFF_ALICE.id, 'manual', 'draft'),
        wa('si-1', STAFF_BOB.id, 'manual', 'draft'),
      ],
      leaveRequests: [makeLeaveRequest(STAFF_ALICE.id, '2026-06-10', '2026-06-10')],
    })
    expect(applyLeaveOverlay(ctx)).toBe(1)
    expect(ctx.assignments.find(a => a.staff_id === STAFF_BOB.id)?.status).toBe('draft')
  })

  it('cancels all assignments within a leave range and spares those outside', () => {
    const shifts = [
      makeShift('si-1', '2026-06-08'),
      makeShift('si-2', '2026-06-09'),
      makeShift('si-3', '2026-06-10'),
      makeShift('si-4', '2026-06-11'),  // one day after leave ends
    ]
    const ctx = makeCtx({
      shifts,
      assignments: shifts.map(s => wa(s.id, STAFF_ALICE.id)),
      leaveRequests: [makeLeaveRequest(STAFF_ALICE.id, '2026-06-08', '2026-06-10')],
    })
    expect(applyLeaveOverlay(ctx)).toBe(3)
    expect(ctx.assignments.find(a => a.shift_instance_id === 'si-1')?.status).toBe('cancelled')
    expect(ctx.assignments.find(a => a.shift_instance_id === 'si-2')?.status).toBe('cancelled')
    expect(ctx.assignments.find(a => a.shift_instance_id === 'si-3')?.status).toBe('cancelled')
    expect(ctx.assignments.find(a => a.shift_instance_id === 'si-4')?.status).toBe('draft')
  })
})
