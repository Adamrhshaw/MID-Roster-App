import type { Assignment, LeaveRequest, ShiftInstance, Staff, StaffAvailability } from '@/types/database'

export type ViolationSeverity = 'warning' | 'info'

export interface Violation {
  rule: string
  name: string
  severity: ViolationSeverity
  message: string
  staffId: string
  // Optional — which shift instance triggered the violation
  shiftInstanceId?: string
}

// Everything a rule needs to evaluate one staff member's assignments for a block
export interface RuleContext {
  staff: Staff
  // All assignments for this staff member in the block, with shift_instance joined
  assignments: (Assignment & { shift_instance: ShiftInstance })[]
  // All leave requests that overlap this block for this staff member
  leaveRequests: LeaveRequest[]
  // All staff availability records for this staff member
  availability: StaffAvailability[]
  // All assignments for ALL staff in the block (needed for coverage rules)
  allAssignments: (Assignment & { shift_instance: ShiftInstance })[]
  // Block date range
  blockStart: string // ISO date
  blockEnd: string   // ISO date
}

export type Rule = (ctx: RuleContext) => Violation[]
