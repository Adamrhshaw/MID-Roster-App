import type { Assignment, Area, LeaveRequest, ShiftInstance, Staff, StaffAvailability } from '@/types/database'
import type { RuleContext } from '../types'

export const AREA_XRAY: Area = {
  id: 'area-xray',
  name: 'X-Ray',
  min_staff_per_shift: 2,
  created_at: '2025-01-01T00:00:00Z',
}

export const AREA_CT: Area = {
  id: 'area-ct',
  name: 'CT',
  min_staff_per_shift: 1,
  created_at: '2025-01-01T00:00:00Z',
}

export const STAFF_ALICE: Staff = {
  id: 'staff-alice',
  full_name: 'Alice Smith',
  employee_id: 'EMP001',
  email: 'alice@example.com',
  phone: null,
  fte_target: 1.0,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  areas: [AREA_XRAY],
}

export const STAFF_BOB: Staff = {
  id: 'staff-bob',
  full_name: 'Bob Jones',
  employee_id: 'EMP002',
  email: 'bob@example.com',
  phone: null,
  fte_target: 0.5,
  is_active: true,
  created_at: '2025-01-01T00:00:00Z',
  areas: [AREA_XRAY],
}

export function makeShiftInstance(overrides: Partial<ShiftInstance> & { id: string; shift_date: string }): ShiftInstance & { area?: Area } {
  return {
    roster_block_id: 'block-1',
    template_id: null,
    area_id: AREA_XRAY.id,
    shift_type: 'morning',
    start_time: '08:00:00',
    end_time: '16:00:00',
    status: 'open',
    area: AREA_XRAY,
    ...overrides,
  }
}

export function makeAssignment(
  id: string,
  staffId: string,
  shiftInstance: ShiftInstance
): Assignment & { shift_instance: ShiftInstance } {
  return {
    id,
    shift_instance_id: shiftInstance.id,
    staff_id: staffId,
    status: 'confirmed',
    source: 'manual',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    shift_instance: shiftInstance,
  }
}

export function makeContext(
  staff: Staff,
  assignments: (Assignment & { shift_instance: ShiftInstance })[],
  overrides: Partial<RuleContext> = {}
): RuleContext {
  return {
    staff,
    assignments,
    leaveRequests: [],
    availability: [],
    allAssignments: assignments,
    blockStart: '2026-05-05',
    blockEnd: '2026-05-31',
    ...overrides,
  }
}

export function makeLeaveRequest(overrides: Partial<LeaveRequest> & { id: string; staff_id: string }): LeaveRequest {
  return {
    leave_type: 'annual',
    start_date: '2026-05-12',
    end_date: '2026-05-16',
    notes: null,
    status: 'approved',
    submitted_via: 'portal',
    reviewed_by: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    ...overrides,
  }
}

export function makeAvailability(staffId: string, dayOfWeek: number, available: boolean): StaffAvailability {
  return { staff_id: staffId, day_of_week: dayOfWeek, available, notes: null }
}
