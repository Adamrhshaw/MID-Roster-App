import { describe, it, expect } from 'vitest'
import type { Area } from '@/types/database'
import { fillGaps } from '../fillGaps'
import { makeCtx, makeLeaveRequest, makeShift, wa, AREA_A, STAFF_ALICE, STAFF_BOB } from './fixtures'

describe('fillGaps', () => {
  it('fills an empty shift with an eligible staff member', () => {
    const shift = makeShift('si-1', '2026-06-02')
    const ctx = makeCtx({
      shifts: [shift],
      shiftRequiredStaff: new Map([['si-1', 1]]),
    })
    const result = fillGaps(ctx)
    expect(result.filledCount).toBe(1)
    expect(result.unresolvableGaps).toHaveLength(0)
    expect(ctx.newGenerated).toHaveLength(1)
    expect(ctx.newGenerated[0].source).toBe('generated')
    expect([STAFF_ALICE.id, STAFF_BOB.id]).toContain(ctx.newGenerated[0].staff_id)
  })

  it('reports an unresolvable gap when no staff are eligible for the shift area', () => {
    const areaB: Area = { id: 'area-b', name: 'CT', min_staff_per_shift: 1, created_at: '2026-01-01T00:00:00Z' }
    const shift = makeShift('si-1', '2026-06-02', { area_id: areaB.id })
    const ctx = makeCtx({
      shifts: [shift],
      areas: [AREA_A, areaB],
      // staffAreas only maps Alice + Bob to AREA_A — nobody is certified for areaB
      shiftRequiredStaff: new Map([['si-1', 1]]),
    })
    const result = fillGaps(ctx)
    expect(result.filledCount).toBe(0)
    expect(result.unresolvableGaps).toHaveLength(1)
    expect(result.unresolvableGaps[0].shiftInstanceId).toBe('si-1')
    expect(result.unresolvableGaps[0].areaName).toBe('CT')
  })

  it('excludes staff who are on approved leave for the shift date', () => {
    const shift = makeShift('si-1', '2026-06-02')
    const ctx = makeCtx({
      shifts: [shift],
      staff: [STAFF_ALICE],
      staffAreas: [{ staff_id: STAFF_ALICE.id, area_id: AREA_A.id, is_primary: true }],
      shiftRequiredStaff: new Map([['si-1', 1]]),
      leaveRequests: [makeLeaveRequest(STAFF_ALICE.id, '2026-06-01', '2026-06-05')],
    })
    const result = fillGaps(ctx)
    expect(result.filledCount).toBe(0)
    expect(result.unresolvableGaps).toHaveLength(1)
  })

  it('excludes staff already assigned to another shift on the same calendar date', () => {
    const morning   = makeShift('si-1', '2026-06-02', { shift_type: 'morning' })
    const afternoon = makeShift('si-2', '2026-06-02', { shift_type: 'afternoon' })
    const ctx = makeCtx({
      shifts: [morning, afternoon],
      staff: [STAFF_ALICE],
      staffAreas: [{ staff_id: STAFF_ALICE.id, area_id: AREA_A.id, is_primary: true }],
      shiftRequiredStaff: new Map([['si-1', 1], ['si-2', 1]]),
      assignments: [wa('si-1', STAFF_ALICE.id, 'manual', 'draft')],  // Alice already on si-1
    })
    const result = fillGaps(ctx)
    expect(result.unresolvableGaps.some(g => g.shiftInstanceId === 'si-2')).toBe(true)
  })

  it('enforces the 10-hour minimum rest period between adjacent shifts', () => {
    // Afternoon (16:00–00:00) ends midnight; next morning (08:00–16:00) starts 08:00 = 8h gap < 10h
    const afternoon = makeShift('si-1', '2026-06-02', { shift_type: 'afternoon' })
    const morning   = makeShift('si-2', '2026-06-03', { shift_type: 'morning' })
    const ctx = makeCtx({
      shifts: [afternoon, morning],
      staff: [STAFF_ALICE],
      staffAreas: [{ staff_id: STAFF_ALICE.id, area_id: AREA_A.id, is_primary: true }],
      shiftRequiredStaff: new Map([['si-1', 1], ['si-2', 1]]),
      assignments: [wa('si-1', STAFF_ALICE.id, 'manual', 'draft')],
    })
    const result = fillGaps(ctx)
    expect(result.unresolvableGaps.some(g => g.shiftInstanceId === 'si-2')).toBe(true)
  })

  it('enforces the FTE weekly hours cap — does not push staff over fte_target × 35h', () => {
    // 2026-06-01 is a Monday; all 5 shifts fall in the same ISO week.
    // Alice (FTE=1.0) max = 35h. 4 × 8h = 32h already assigned; 5th = 40h > 35h.
    const shifts = [
      makeShift('si-1', '2026-06-01'),
      makeShift('si-2', '2026-06-02'),
      makeShift('si-3', '2026-06-03'),
      makeShift('si-4', '2026-06-04'),
      makeShift('si-5', '2026-06-05'),
    ]
    const ctx = makeCtx({
      shifts,
      staff: [STAFF_ALICE],
      staffAreas: [{ staff_id: STAFF_ALICE.id, area_id: AREA_A.id, is_primary: true }],
      shiftRequiredStaff: new Map(shifts.map(s => [s.id, 1])),
      assignments: [
        wa('si-1', STAFF_ALICE.id, 'manual', 'draft'),
        wa('si-2', STAFF_ALICE.id, 'manual', 'draft'),
        wa('si-3', STAFF_ALICE.id, 'manual', 'draft'),
        wa('si-4', STAFF_ALICE.id, 'manual', 'draft'),
      ],
    })
    const result = fillGaps(ctx)
    expect(result.unresolvableGaps.some(g => g.shiftInstanceId === 'si-5')).toBe(true)
  })

  it('picks the staff member with fewer hours first (fairness)', () => {
    // Alice already has si-1 (8h); Bob has nothing.
    // When filling si-2 (a different date, well within rest limits), Bob should be picked.
    const shift1 = makeShift('si-1', '2026-06-01')
    const shift2 = makeShift('si-2', '2026-06-03')  // 2-day gap → 40h rest, well above 10h
    const ctx = makeCtx({
      shifts: [shift1, shift2],
      shiftRequiredStaff: new Map([['si-1', 1], ['si-2', 1]]),
      assignments: [wa('si-1', STAFF_ALICE.id, 'manual', 'draft')],
    })
    const result = fillGaps(ctx)
    expect(result.filledCount).toBe(1)
    expect(ctx.newGenerated[0].staff_id).toBe(STAFF_BOB.id)
  })
})
