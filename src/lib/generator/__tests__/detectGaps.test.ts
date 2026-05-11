import { describe, it, expect } from 'vitest'
import type { Area } from '@/types/database'
import { detectGaps } from '../detectGaps'
import { makeCtx, makeShift, wa, AREA_A, STAFF_ALICE, STAFF_BOB } from './fixtures'

describe('detectGaps', () => {
  it('returns empty when all shifts are fully staffed', () => {
    const shift = makeShift('si-1', '2026-06-02')
    const ctx = makeCtx({
      shifts: [shift],
      shiftRequiredStaff: new Map([['si-1', 1]]),
      assignments: [wa('si-1', STAFF_ALICE.id)],
    })
    expect(detectGaps(ctx)).toHaveLength(0)
  })

  it('detects a gap with correct required / filled / missing counts', () => {
    const shift = makeShift('si-1', '2026-06-02')
    const ctx = makeCtx({
      shifts: [shift],
      shiftRequiredStaff: new Map([['si-1', 2]]),
      assignments: [wa('si-1', STAFF_ALICE.id)],
    })
    const gaps = detectGaps(ctx)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].shift.id).toBe('si-1')
    expect(gaps[0].required).toBe(2)
    expect(gaps[0].filled).toBe(1)
    expect(gaps[0].missing).toBe(1)
  })

  it('treats cancelled assignments as unfilled when counting', () => {
    const shift = makeShift('si-1', '2026-06-02')
    const ctx = makeCtx({
      shifts: [shift],
      shiftRequiredStaff: new Map([['si-1', 1]]),
      assignments: [wa('si-1', STAFF_ALICE.id, 'manual', 'cancelled')],
    })
    const gaps = detectGaps(ctx)
    expect(gaps).toHaveLength(1)
    expect(gaps[0].filled).toBe(0)
  })

  it('sorts safety-critical shifts (filled < area min) ahead of normal gaps regardless of date', () => {
    // si-1 is on a later date but 0 filled — below area min=2 → safetyKey=0
    // si-2 is on an earlier date but 2 filled — at area min=2 → safetyKey=1
    const areaMin2: Area = { ...AREA_A, min_staff_per_shift: 2 }
    const shiftLater   = makeShift('si-1', '2026-06-03')
    const shiftEarlier = makeShift('si-2', '2026-06-02')
    const ctx = makeCtx({
      shifts: [shiftLater, shiftEarlier],
      areas: [areaMin2],
      shiftRequiredStaff: new Map([['si-1', 3], ['si-2', 3]]),
      assignments: [
        wa('si-2', STAFF_ALICE.id),
        wa('si-2', STAFF_BOB.id),
      ],
    })
    const gaps = detectGaps(ctx)
    expect(gaps).toHaveLength(2)
    expect(gaps[0].shift.id).toBe('si-1')  // safety-critical wins over earlier date
    expect(gaps[1].shift.id).toBe('si-2')
  })

  it('sorts gaps by date ascending within the same priority', () => {
    const shifts = [
      makeShift('si-c', '2026-06-05'),
      makeShift('si-a', '2026-06-03'),
      makeShift('si-b', '2026-06-04'),
    ]
    const ctx = makeCtx({
      shifts,
      shiftRequiredStaff: new Map(shifts.map(s => [s.id, 1])),
    })
    const gaps = detectGaps(ctx)
    expect(gaps.map(g => g.shift.shift_date)).toEqual(['2026-06-03', '2026-06-04', '2026-06-05'])
  })

  it('sorts night → morning → afternoon within the same date', () => {
    const date = '2026-06-05'
    const shifts = [
      makeShift('si-pm', date, { shift_type: 'afternoon' }),
      makeShift('si-nt', date, { shift_type: 'night' }),
      makeShift('si-am', date, { shift_type: 'morning' }),
    ]
    const ctx = makeCtx({
      shifts,
      shiftRequiredStaff: new Map(shifts.map(s => [s.id, 1])),
    })
    const gaps = detectGaps(ctx)
    expect(gaps.map(g => g.shift.shift_type)).toEqual(['night', 'morning', 'afternoon'])
  })
})
