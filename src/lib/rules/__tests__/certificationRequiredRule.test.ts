import { describe, it, expect } from 'vitest'
import { certificationRequiredRule } from '../certificationRequiredRule'
import { makeAssignment, makeContext, makeShiftInstance, AREA_CT, AREA_XRAY, STAFF_ALICE } from './fixtures'

describe('certificationRequiredRule', () => {
  it('flags a shift in an area the staff member is not certified for', () => {
    // STAFF_ALICE is certified for AREA_XRAY only; shift is in AREA_CT
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05', area_id: AREA_CT.id, area: AREA_CT })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)])
    const violations = certificationRequiredRule(ctx)
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('certificationRequired')
    expect(violations[0].message).toContain('CT')
  })

  it('returns no violations when shift is in a certified area', () => {
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05', area_id: AREA_XRAY.id, area: AREA_XRAY })
    const ctx = makeContext(STAFF_ALICE, [makeAssignment('a1', STAFF_ALICE.id, si)])
    expect(certificationRequiredRule(ctx)).toHaveLength(0)
  })

  it('skips the check when staff has no areas configured', () => {
    const staffNoAreas = { ...STAFF_ALICE, areas: [] }
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05', area_id: AREA_CT.id, area: AREA_CT })
    const ctx = makeContext(staffNoAreas, [makeAssignment('a1', staffNoAreas.id, si)])
    expect(certificationRequiredRule(ctx)).toHaveLength(0)
  })

  it('returns no violations for empty assignments', () => {
    expect(certificationRequiredRule(makeContext(STAFF_ALICE, []))).toHaveLength(0)
  })
})
