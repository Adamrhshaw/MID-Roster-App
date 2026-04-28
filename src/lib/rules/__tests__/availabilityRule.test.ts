import { describe, it, expect } from 'vitest'
import { availabilityRule } from '../availabilityRule'
import { makeAssignment, makeAvailability, makeContext, makeShiftInstance, STAFF_ALICE } from './fixtures'

describe('availabilityRule', () => {
  it('flags a shift on a day the staff member is unavailable', () => {
    // 2026-05-09 is a Saturday (day 6)
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-09' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)], {
      availability: [makeAvailability(STAFF_ALICE.id, 6, false)],
    })
    const violations = availabilityRule(ctx)
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('availability')
    expect(violations[0].message).toContain('Saturday')
  })

  it('does not flag when staff is available on that day', () => {
    // 2026-05-05 is a Tuesday (day 2)
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)], {
      availability: [makeAvailability(STAFF_ALICE.id, 2, true)],
    })
    expect(availabilityRule(ctx)).toHaveLength(0)
  })

  it('does not flag when no availability records exist (unconstrained)', () => {
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-09' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)], { availability: [] })
    expect(availabilityRule(ctx)).toHaveLength(0)
  })

  it('does not flag when availability for that day is not configured', () => {
    // Availability only for Monday (1), rostered on Saturday (6)
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-09' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)], {
      availability: [makeAvailability(STAFF_ALICE.id, 1, true)],
    })
    expect(availabilityRule(ctx)).toHaveLength(0)
  })
})
