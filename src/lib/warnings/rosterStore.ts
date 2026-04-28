import { create } from 'zustand'
import type { Assignment, Area, LeaveRequest, ShiftInstance, Staff, StaffAvailability } from '@/types/database'
import type { Violation } from '@/lib/rules/types'
import {
  minimumRestPeriodRule,
  maxWeeklyHoursRule,
  leaveConflictRule,
  availabilityRule,
  certificationRequiredRule,
} from '@/lib/rules'
import { areaCoverageRule } from '@/lib/rules/areaCoverageRule'

export type RichAssignment = Assignment & { shift_instance: ShiftInstance }

interface RosterState {
  // Core data (loaded once from API)
  blockId: string | null
  blockStart: string
  blockEnd: string
  staff: Staff[]
  shifts: ShiftInstance[]
  areas: Area[]
  leaveRequests: LeaveRequest[]
  availability: StaffAvailability[]

  // Mutable assignment state
  assignments: RichAssignment[]

  // Violations (recomputed after changes)
  violations: Violation[]

  // Cell to flash-highlight on violation click (shiftInstanceId + staffId, auto-clears)
  highlightedCell: { shiftInstanceId: string; staffId: string } | null

  // Actions
  hydrate: (payload: {
    blockId: string
    blockStart: string
    blockEnd: string
    staff: Staff[]
    shifts: ShiftInstance[]
    areas: Area[]
    assignments: RichAssignment[]
    leaveRequests: LeaveRequest[]
    availability: StaffAvailability[]
  }) => void

  // Assign a staff member to a shift instance (no prior assignment required)
  assign: (shiftInstanceId: string, staffId: string) => void

  // Reassign a shift pill from one staff member to another (same shift instance)
  reassign: (shiftInstanceId: string, fromStaffId: string, toStaffId: string) => void

  // Flash-highlight a specific staff+shift cell (clears after 2s)
  highlightCell: (shiftInstanceId: string, staffId: string) => void

  // Re-run rules for given staff IDs immediately, then schedule full recheck
  runRulesFor: (staffIds: string[]) => void

  // Run all rules for all staff + coverage
  runAllRules: () => void
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function runRules(
  staffIds: string[],
  state: Pick<RosterState, 'staff' | 'assignments' | 'shifts' | 'areas' | 'leaveRequests' | 'availability' | 'blockStart' | 'blockEnd'>
): Violation[] {
  const targetIds = new Set(staffIds)
  const violations: Violation[] = []

  for (const s of state.staff) {
    if (!targetIds.has(s.id)) continue
    const staffAssignments = state.assignments.filter(a => a.staff_id === s.id)
    const ctx = {
      staff: s,
      assignments: staffAssignments,
      leaveRequests: state.leaveRequests.filter(l => l.staff_id === s.id),
      availability: state.availability.filter(av => av.staff_id === s.id),
      allAssignments: state.assignments,
      blockStart: state.blockStart,
      blockEnd: state.blockEnd,
    }
    violations.push(
      ...minimumRestPeriodRule(ctx),
      ...maxWeeklyHoursRule(ctx),
      ...leaveConflictRule(ctx),
      ...availabilityRule(ctx),
      ...certificationRequiredRule(ctx),
    )
  }

  // Coverage is block-level — always recheck when any staff changes
  violations.push(...areaCoverageRule({ allAssignments: state.assignments }, state.areas))

  return violations
}

export const useRosterStore = create<RosterState>((set, get) => ({
  blockId: null,
  blockStart: '',
  blockEnd: '',
  staff: [],
  shifts: [],
  areas: [],
  leaveRequests: [],
  availability: [],
  assignments: [],
  violations: [],
  highlightedCell: null,

  highlightCell(shiftInstanceId, staffId) {
    set({ highlightedCell: { shiftInstanceId, staffId } })
    setTimeout(() => {
      const c = get().highlightedCell
      if (c?.shiftInstanceId === shiftInstanceId && c?.staffId === staffId) {
        set({ highlightedCell: null })
      }
    }, 2000)
  },

  hydrate(payload) {
    set({
      blockId: payload.blockId,
      blockStart: payload.blockStart,
      blockEnd: payload.blockEnd,
      staff: payload.staff,
      shifts: payload.shifts,
      areas: payload.areas,
      assignments: payload.assignments,
      leaveRequests: payload.leaveRequests,
      availability: payload.availability,
      violations: [],
    })
    // Run full rules after initial load
    get().runAllRules()
  },

  assign(shiftInstanceId, staffId) {
    const state = get()
    const shiftInstance = state.shifts.find(s => s.id === shiftInstanceId)
    if (!shiftInstance) return
    // No-op if already assigned
    if (state.assignments.some(a => a.shift_instance_id === shiftInstanceId && a.staff_id === staffId)) return

    set({
      assignments: [
        ...state.assignments,
        {
          id: `pending-${shiftInstanceId}-${staffId}`,
          shift_instance_id: shiftInstanceId,
          staff_id: staffId,
          status: 'confirmed' as const,
          source: 'manual' as const,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          shift_instance: shiftInstance,
        },
      ],
    })
    get().runRulesFor([staffId])
  },

  reassign(shiftInstanceId, fromStaffId, toStaffId) {
    const state = get()
    const shiftInstance = state.shifts.find(s => s.id === shiftInstanceId)
    if (!shiftInstance) return

    const updated = state.assignments
      .filter(a => !(a.shift_instance_id === shiftInstanceId && a.staff_id === fromStaffId))
      .concat({
        id: `pending-${shiftInstanceId}-${toStaffId}`,
        shift_instance_id: shiftInstanceId,
        staff_id: toStaffId,
        status: 'draft' as const,
        source: 'manual' as const,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        shift_instance: shiftInstance,
      })

    set({ assignments: updated })
    get().runRulesFor([fromStaffId, toStaffId])
  },

  runRulesFor(staffIds) {
    const state = get()

    // Fast check: rerun only for affected staff, merge with existing violations
    const otherViolations = state.violations.filter(
      v => !staffIds.includes(v.staffId) && v.rule !== 'areaCoverage'
    )
    const freshViolations = runRules(staffIds, state)
    set({ violations: [...otherViolations, ...freshViolations] })

    // Debounced full recheck
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => get().runAllRules(), 300)
  },

  runAllRules() {
    const state = get()
    const allStaffIds = state.staff.map(s => s.id)
    set({ violations: runRules(allStaffIds, state) })
  },
}))
