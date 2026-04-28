// Database types — mirrors the schema defined in supabase/migrations/001_initial_schema.sql
// Run `npx supabase gen types typescript` to regenerate from a live project

export type ShiftType = 'morning' | 'afternoon' | 'night' | 'ado'
export type BlockStatus = 'draft' | 'published' | 'archived'
export type AssignmentStatus = 'confirmed' | 'draft' | 'swapped' | 'cancelled'
export type AssignmentSource = 'generated' | 'manual' | 'swap'
export type LeaveType = 'annual' | 'sick' | 'study' | 'ado' | 'rdo' | 'long_service' | 'parental' | 'bereavement' | 'military' | 'other'
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type SubmittedVia = 'portal' | 'manager'
export type ShiftInstanceStatus = 'open' | 'filled' | 'understaffed'

export interface Area {
  id: string
  name: string
  min_staff_per_shift: number
  created_at: string
}

export interface Staff {
  id: string
  full_name: string
  employee_id: string
  email: string
  phone: string | null
  fte_target: number
  is_active: boolean
  created_at: string
  // joined
  areas?: Area[]
}

export interface StaffArea {
  staff_id: string
  area_id: string
  is_primary: boolean
}

export interface StaffAvailability {
  staff_id: string
  day_of_week: number
  available: boolean
  notes: string | null
}

export interface ShiftTemplate {
  id: string
  area_id: string
  shift_type: ShiftType
  start_time: string
  end_time: string
  duration_hours: number
  ado_accrual_minutes: number
  day_of_week: number
  required_staff: number
  is_active: boolean
  // joined
  area?: Area
}

export interface RosterBlock {
  id: string
  name: string | null
  start_date: string
  end_date: string
  status: BlockStatus
  generated_at: string | null
  published_at: string | null
  created_by: string | null
}

export interface ShiftInstance {
  id: string
  roster_block_id: string
  template_id: string | null
  area_id: string
  shift_type: ShiftType
  shift_date: string
  start_time: string
  end_time: string
  status: ShiftInstanceStatus
  // joined
  area?: Area
  assignments?: Assignment[]
}

export interface Assignment {
  id: string
  shift_instance_id: string
  staff_id: string
  status: AssignmentStatus
  source: AssignmentSource
  created_at: string
  updated_at: string
  // joined
  staff?: Staff
  shift_instance?: ShiftInstance
}

export interface LeaveRequest {
  id: string
  staff_id: string
  leave_type: LeaveType
  start_date: string
  end_date: string
  notes: string | null
  status: RequestStatus
  submitted_via: SubmittedVia
  reviewed_by: string | null
  created_at: string
  updated_at: string
  // joined
  staff?: Staff
}

export interface ShiftSwap {
  id: string
  requester_staff_id: string
  requester_assignment_id: string
  target_staff_id: string | null
  target_assignment_id: string | null
  reason: string | null
  status: RequestStatus
  reviewed_by: string | null
  created_at: string
  // joined
  requester_staff?: Staff
  target_staff?: Staff
  requester_assignment?: Assignment
  target_assignment?: Assignment
}

export interface AdoAccrual {
  id: string
  staff_id: string
  roster_block_id: string
  accrual_minutes: number
  ado_day_date: string | null
  ado_assignment_id: string | null
  created_at: string
}
