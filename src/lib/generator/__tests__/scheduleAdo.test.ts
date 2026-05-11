import { describe, it, expect } from 'vitest'
import { scheduleAdo } from '../scheduleAdo'
import { dateSeries, makeCtx, makeShift, wa, AREA_A, STAFF_ALICE, STAFF_BOB } from './fixtures'

const ADO_DAY_THRESHOLD = 480
const ADO_PER_SHIFT = 22

describe('scheduleAdo', () => {
  it('records carry-forward accrual when staff is below the 480-min threshold', () => {
    // 21 shifts × 22 min = 462 — just below threshold, no ADO due
    const dates = dateSeries('2026-06-01', 21)
    const shifts = dates.map((d, i) => makeShift(`si-${i + 1}`, d))
    const ctx = makeCtx({
      staff: [STAFF_ALICE],
      staffAreas: [{ staff_id: STAFF_ALICE.id, area_id: AREA_A.id, is_primary: true }],
      shifts,
      shiftRequiredStaff: new Map(shifts.map(s => [s.id, 1])),
      assignments: shifts.map(s => wa(s.id, STAFF_ALICE.id)),
    })
    const result = scheduleAdo(ctx)
    expect(result.scheduled).toBe(0)
    expect(result.deferred).toBe(0)
    const rec = result.records.find(r => r.staffId === STAFF_ALICE.id)!
    expect(rec.accrualMinutes).toBe(21 * ADO_PER_SHIFT)  // 462
    expect(rec.adoDayDate).toBeNull()
  })

  it('schedules an ADO day when accrual meets the threshold and coverage allows it', () => {
    // 22 shifts for Alice (484 min ≥ 480). Bob is also on the last shift so coverage
    // stays at 1 after Alice is released → that shift is the ADO candidate.
    const dates = dateSeries('2026-06-01', 22)
    const shifts = dates.map((d, i) => makeShift(`si-${i + 1}`, d))
    const assignments = [
      ...shifts.map(s => wa(s.id, STAFF_ALICE.id)),
      wa('si-22', STAFF_BOB.id),  // Bob on last shift keeps coverage ≥ area min=1
    ]
    const ctx = makeCtx({
      shifts,
      shiftRequiredStaff: new Map(shifts.map(s => [s.id, 1])),
      assignments,
    })
    const result = scheduleAdo(ctx)
    expect(result.scheduled).toBe(1)
    const rec = result.records.find(r => r.staffId === STAFF_ALICE.id)!
    // findAdoCandidateDay prefers the latest eligible date
    expect(rec.adoDayDate).toBe(dates[21])
    // Alice's assignment on that shift should now be cancelled in context
    const adoAssignment = ctx.assignments.find(
      a => a.shift_instance_id === 'si-22' && a.staff_id === STAFF_ALICE.id
    )!
    expect(adoAssignment.status).toBe('cancelled')
    expect(ctx.toCancel).toContainEqual({ shift_instance_id: 'si-22', staff_id: STAFF_ALICE.id })
  })

  it('defers ADO when all of the staff member\'s shifts are at minimum coverage', () => {
    // 22 shifts, each with only Alice. Removing her drops coverage to 0 < area min=1.
    const dates = dateSeries('2026-06-01', 22)
    const shifts = dates.map((d, i) => makeShift(`si-${i + 1}`, d))
    const ctx = makeCtx({
      staff: [STAFF_ALICE],
      staffAreas: [{ staff_id: STAFF_ALICE.id, area_id: AREA_A.id, is_primary: true }],
      shifts,
      shiftRequiredStaff: new Map(shifts.map(s => [s.id, 1])),
      assignments: shifts.map(s => wa(s.id, STAFF_ALICE.id)),
    })
    const result = scheduleAdo(ctx)
    expect(result.deferred).toBe(1)
    expect(result.scheduled).toBe(0)
    const rec = result.records.find(r => r.staffId === STAFF_ALICE.id)!
    expect(rec.adoDayDate).toBeNull()
    // Full accrual carries forward when deferred
    expect(rec.accrualMinutes).toBe(22 * ADO_PER_SHIFT)
  })

  it('records the correct residual accrual after scheduling an ADO (accrued − 480)', () => {
    // 22 × 22 = 484 min accrued. After consuming one ADO: 484 − 480 = 4 min residual.
    const dates = dateSeries('2026-06-01', 22)
    const shifts = dates.map((d, i) => makeShift(`si-${i + 1}`, d))
    const assignments = [
      ...shifts.map(s => wa(s.id, STAFF_ALICE.id)),
      wa('si-22', STAFF_BOB.id),
    ]
    const ctx = makeCtx({
      shifts,
      shiftRequiredStaff: new Map(shifts.map(s => [s.id, 1])),
      assignments,
    })
    const result = scheduleAdo(ctx)
    const rec = result.records.find(r => r.staffId === STAFF_ALICE.id)!
    expect(rec.accrualMinutes).toBe(22 * ADO_PER_SHIFT - ADO_DAY_THRESHOLD)  // 4 min
  })

  it('records zero accrual for a staff member with no assigned shifts', () => {
    const ctx = makeCtx({
      staff: [STAFF_ALICE],
      staffAreas: [{ staff_id: STAFF_ALICE.id, area_id: AREA_A.id, is_primary: true }],
    })
    const result = scheduleAdo(ctx)
    const rec = result.records.find(r => r.staffId === STAFF_ALICE.id)!
    expect(rec.accrualMinutes).toBe(0)
    expect(rec.adoDayDate).toBeNull()
    expect(result.scheduled).toBe(0)
  })
})
