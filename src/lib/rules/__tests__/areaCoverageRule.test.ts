import { describe, it, expect } from 'vitest'
import { areaCoverageRule } from '../areaCoverageRule'
import { makeAssignment, makeShiftInstance, AREA_XRAY, AREA_CT, STAFF_ALICE, STAFF_BOB } from './fixtures'

describe('areaCoverageRule', () => {
  it('flags an understaffed shift (1 of 2 required)', () => {
    // AREA_XRAY requires min_staff_per_shift = 2
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05' })
    const allAssignments = [makeAssignment('a1', STAFF_ALICE.id, si)]
    const violations = areaCoverageRule({ allAssignments }, [AREA_XRAY])
    expect(violations).toHaveLength(1)
    expect(violations[0].rule).toBe('areaCoverage')
    expect(violations[0].message).toContain('1/2')
  })

  it('returns no violations when shift is fully staffed', () => {
    const si = makeShiftInstance({ id: 'si-1', shift_date: '2026-05-05' })
    const allAssignments = [
      makeAssignment('a1', STAFF_ALICE.id, si),
      makeAssignment('a2', STAFF_BOB.id, si),
    ]
    const violations = areaCoverageRule({ allAssignments }, [AREA_XRAY])
    expect(violations).toHaveLength(0)
  })

  it('returns no violations when no assignments exist', () => {
    expect(areaCoverageRule({ allAssignments: [] }, [AREA_XRAY])).toHaveLength(0)
  })

  it('handles multiple shifts independently', () => {
    // CT requires min 1 — fully staffed. X-Ray requires 2 — only 1 assigned.
    const xraySi = makeShiftInstance({ id: 'si-xray', shift_date: '2026-05-05', area_id: AREA_XRAY.id })
    const ctSi = makeShiftInstance({ id: 'si-ct', shift_date: '2026-05-05', area_id: AREA_CT.id, area: AREA_CT })
    const allAssignments = [
      makeAssignment('a1', STAFF_ALICE.id, xraySi),
      makeAssignment('a2', STAFF_BOB.id, ctSi),
    ]
    const violations = areaCoverageRule({ allAssignments }, [AREA_XRAY, AREA_CT])
    expect(violations).toHaveLength(1)
    expect(violations[0].message).toContain('X-Ray')
  })
})
