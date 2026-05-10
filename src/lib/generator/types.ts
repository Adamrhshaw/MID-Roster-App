import type {
  Area,
  LeaveRequest,
  ShiftInstance,
  ShiftTemplate,
  Staff,
  StaffArea,
  StaffAvailability,
} from '@/types/database'

export interface UnresolvableGap {
  shiftInstanceId: string
  areaName: string
  date: string
  shiftType: string
  required: number
  filled: number
}

export interface GenerationReport {
  filledCount: number
  unresolvableGaps: UnresolvableGap[]
  preservedManualAssignments: number
  cancelledByLeave: number
  adoScheduled: number
  adoDeferred: number
}

// Internal working representation of an assignment — mirrors what we'll persist.
export interface WorkingAssignment {
  shift_instance_id: string
  staff_id: string
  status: 'draft' | 'confirmed' | 'cancelled'
  source: 'generated' | 'manual' | 'swap'
}

export interface GeneratorContext {
  block: { id: string; start_date: string; end_date: string }
  shifts: ShiftInstance[]
  // shift_instance_id → required_staff from the template
  shiftRequiredStaff: Map<string, number>
  templates: ShiftTemplate[]
  staff: Staff[]
  staffAreas: StaffArea[]
  staffAvailability: StaffAvailability[]
  // already filtered to status='approved' AND overlapping the block
  leaveRequests: LeaveRequest[]
  areas: Area[]

  // Working state — mutated across phases.
  // Includes preserved manual/swap assignments + newly-generated assignments.
  // Cancelled rows are kept here so we know they exist (for UNIQUE constraint avoidance).
  assignments: WorkingAssignment[]

  // Tracks new generated assignments to INSERT at the end.
  newGenerated: WorkingAssignment[]
  // Tracks (shift_instance_id, staff_id) pairs we've newly cancelled — to UPDATE at the end.
  toCancel: { shift_instance_id: string; staff_id: string }[]
}
