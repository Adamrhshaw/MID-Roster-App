import type { Area, LeaveRequest, ShiftInstance, Staff } from '@/types/database'
import type { GeneratorContext, WorkingAssignment } from '../types'

export const BLOCK = { id: 'block-test', start_date: '2026-06-01', end_date: '2026-06-28' }

export const AREA_A: Area = {
  id: 'area-a',
  name: 'X-Ray',
  min_staff_per_shift: 1,
  created_at: '2026-01-01T00:00:00Z',
}

export const STAFF_ALICE: Staff = {
  id: 'staff-alice',
  full_name: 'Alice Smith',
  employee_id: 'EMP001',
  email: 'alice@test.com',
  phone: null,
  fte_target: 1.0,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
}

export const STAFF_BOB: Staff = {
  id: 'staff-bob',
  full_name: 'Bob Jones',
  employee_id: 'EMP002',
  email: 'bob@test.com',
  phone: null,
  fte_target: 1.0,
  is_active: true,
  created_at: '2026-01-01T00:00:00Z',
}

const SHIFT_TIMES = {
  morning:   { start_time: '08:00:00', end_time: '16:00:00' },
  afternoon: { start_time: '16:00:00', end_time: '00:00:00' },
  night:     { start_time: '00:00:00', end_time: '08:00:00' },
  ado:       { start_time: '08:00:00', end_time: '16:00:00' },
}

export function makeShift(
  id: string,
  shift_date: string,
  options: {
    shift_type?: 'morning' | 'afternoon' | 'night' | 'ado'
    area_id?: string
    template_id?: string
  } = {}
): ShiftInstance {
  const type = options.shift_type ?? 'morning'
  return {
    id,
    roster_block_id: BLOCK.id,
    template_id: options.template_id ?? null,
    area_id: options.area_id ?? AREA_A.id,
    shift_type: type,
    shift_date,
    ...SHIFT_TIMES[type],
    status: 'open',
  }
}

export function makeLeaveRequest(
  staffId: string,
  startDate: string,
  endDate: string
): LeaveRequest {
  return {
    id: `leave-${staffId}-${startDate}`,
    staff_id: staffId,
    leave_type: 'annual',
    start_date: startDate,
    end_date: endDate,
    notes: null,
    status: 'approved',
    submitted_via: 'portal',
    reviewed_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  }
}

/** Shorthand for building a WorkingAssignment in tests. */
export function wa(
  shift_instance_id: string,
  staff_id: string,
  source: WorkingAssignment['source'] = 'manual',
  status: WorkingAssignment['status'] = 'draft'
): WorkingAssignment {
  return { shift_instance_id, staff_id, status, source }
}

/** Build a GeneratorContext with sensible defaults; override specific fields per test. */
export function makeCtx(overrides: Partial<GeneratorContext> = {}): GeneratorContext {
  return {
    block: BLOCK,
    shifts: [],
    shiftRequiredStaff: new Map(),
    templates: [],
    staff: [STAFF_ALICE, STAFF_BOB],
    staffAreas: [
      { staff_id: STAFF_ALICE.id, area_id: AREA_A.id, is_primary: true },
      { staff_id: STAFF_BOB.id,   area_id: AREA_A.id, is_primary: true },
    ],
    staffAvailability: [],
    leaveRequests: [],
    areas: [AREA_A],
    assignments: [],
    newGenerated: [],
    toCancel: [],
    ...overrides,
  }
}

/** Produce `count` ISO date strings starting at `base`, incrementing by 1 day each. */
export function dateSeries(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + i)
    return d.toISOString().split('T')[0]
  })
}
