import { describe, it, expect } from 'vitest'
import { maxWeeklyHoursRule } from '../maxWeeklyHoursRule'
import { makeAssignment, makeContext, makeShiftInstance, STAFF_ALICE, STAFF_BOB } from './fixtures'

// All dates in 2026-W19 (Mon 4 May – Sun 10 May)
const MON = '2026-05-04'
const TUE = '2026-05-05'
const WED = '2026-05-06'
const THU = '2026-05-07'
const FRI = '2026-05-08'

describe('maxWeeklyHoursRule', () => {
  it('returns no violations when hours are within target (35h, 4 × 8h shifts = 32h)', () => {
    const shifts = [MON, TUE, WED, THU].map((date, i) =>
      makeShiftInstance({ id: `si-${i}`, shift_date: date })
    )
    const ctx = makeContext(STAFF_ALICE, shifts.map((s, i) => makeAssignment(`a${i}`, STAFF_ALICE.id, s)))
    expect(maxWeeklyHoursRule(ctx)).toHaveLength(0)
  })

  it('flags when a full-time staff member has too many hours in a week (5 × 8h = 40h > 35h)', () => {
    const shifts = [MON, TUE, WED, THU, FRI].map((date, i) =>
      makeShiftInstance({ id: `si-${i}`, shift_date: date })
    )
    const ctx = makeContext(STAFF_ALICE, shifts.map((s, i) => makeAssignment(`a${i}`, STAFF_ALICE.id, s)))
    const violations = maxWeeklyHoursRule(ctx)
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('maxWeeklyHours')
    expect(violations[0].message).toContain('40.0h')
  })

  it('flags part-time staff at 0.5 FTE with 4 × 8h = 32h > 17.5h target', () => {
    const shifts = [MON, TUE, WED, THU].map((date, i) =>
      makeShiftInstance({ id: `si-${i}`, shift_date: date })
    )
    const ctx = makeContext(STAFF_BOB, shifts.map((s, i) => makeAssignment(`a${i}`, STAFF_BOB.id, s)))
    const violations = maxWeeklyHoursRule(ctx)
    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('FTE 0.5')
  })

  it('does not count ADO shifts toward weekly hours', () => {
    // 4 regular shifts (32h) + 1 ADO — should not trigger at 35h target
    const regular = [MON, TUE, WED, THU].map((date, i) =>
      makeShiftInstance({ id: `si-${i}`, shift_date: date })
    )
    const ado = makeShiftInstance({ id: 'si-ado', shift_date: FRI, shift_type: 'ado' })
    const all = [...regular, ado]
    const ctx = makeContext(STAFF_ALICE, all.map((s, i) => makeAssignment(`a${i}`, STAFF_ALICE.id, s)))
    expect(maxWeeklyHoursRule(ctx)).toHaveLength(0)
  })

  it('returns no violations for empty assignments', () => {
    expect(maxWeeklyHoursRule(makeContext(STAFF_ALICE, []))).toHaveLength(0)
  })
})
