import { describe, it, expect } from 'vitest'
import { minimumRestPeriodRule } from '../minimumRestPeriodRule'
import { makeAssignment, makeContext, makeShiftInstance, STAFF_ALICE } from './fixtures'

describe('minimumRestPeriodRule', () => {
  it('returns no violations when rest between shifts exceeds 10h', () => {
    const morning = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05', shift_type: 'morning', start_time: '08:00:00', end_time: '16:00:00' })
    const nextMorning = makeShiftInstance({ id: 'si-2', shift_date: '2026-05-06', shift_type: 'morning', start_time: '08:00:00', end_time: '16:00:00' })
    const ctx = makeContext(STAFF_ALICE, [
      makeAssignment('a1', STAFF_ALICE.id, morning),
      makeAssignment('a2', STAFF_ALICE.id, nextMorning),
    ])
    expect(minimumRestPeriodRule(ctx)).toHaveLength(0)
  })

  it('flags when afternoon into morning leaves under 10h rest', () => {
    // Afternoon ends 00:00, morning starts 08:00 next day = 8h rest
    const afternoon = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05', shift_type: 'afternoon', start_time: '16:00:00', end_time: '00:00:00' })
    const morning = makeShiftInstance({ id: 'si-2', shift_date: '2026-05-06', shift_type: 'morning', start_time: '08:00:00', end_time: '16:00:00' })
    const ctx = makeContext(STAFF_ALICE, [
      makeAssignment('a1', STAFF_ALICE.id, afternoon),
      makeAssignment('a2', STAFF_ALICE.id, morning),
    ])
    const violations = minimumRestPeriodRule(ctx)
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('minimumRestPeriod')
    expect(violations[0].staffId).toBe(STAFF_ALICE.id)
    expect(violations[0].shiftInstanceId).toBe('si-2')
  })

  it('flags night into morning on same calendar day (< 10h rest)', () => {
    // Night ends 08:00, morning starts 08:00 same day = 0h rest
    const night = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05', shift_type: 'night', start_time: '00:00:00', end_time: '08:00:00' })
    const morning = makeShiftInstance({ id: 'si-2', shift_date: '2026-05-05', shift_type: 'morning', start_time: '08:00:00', end_time: '16:00:00' })
    const ctx = makeContext(STAFF_ALICE, [
      makeAssignment('a1', STAFF_ALICE.id, night),
      makeAssignment('a2', STAFF_ALICE.id, morning),
    ])
    const violations = minimumRestPeriodRule(ctx)
    expect(violations).toHaveLength(1)
  })

  it('returns no violations for a single shift', () => {
    const morning = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05' })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, morning)])
    expect(minimumRestPeriodRule(ctx)).toHaveLength(0)
  })

  it('returns no violations for empty assignments', () => {
    const ctx = makeContext(STAFF_ALICE, [])
    expect(minimumRestPeriodRule(ctx)).toHaveLength(0)
  })
})
