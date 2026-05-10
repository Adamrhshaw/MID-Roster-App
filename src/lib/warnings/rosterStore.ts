import { create } from 'zustand'
import type { Assignment, Area, LeaveRequest, ShiftInstance, Staff, StaffArea, StaffAvailability } from '@/types/database'
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
  staffAreas: StaffArea[]
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
    staffAreas: StaffArea[]
    assignments: RichAssignment[]
    leaveRequests: LeaveRequest[]
    availability: StaffAvailability[]
  }) => void

  // Assign a staff member to a shift instance (no prior assignment required)
  assign: (shiftInstanceId: string, staffId: string) => void

  // Cancel a single assignment.
  unassign: (shiftInstanceId: string, staffId: string) => void

  // Move a staff member from one shift instance to another (DnD onto empty cell space).
  move: (staffId: string, fromShiftInstanceId: string, toShiftInstanceId: string) => void

  // Swap two staff members between shift instances (DnD chip-onto-chip).
  swap: (
    aStaffId: string,
    aShiftInstanceId: string,
    bStaffId: string,
    bShiftInstanceId: string,
  ) => void

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
  staffAreas: [],
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
      staffAreas: payload.staffAreas,
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

  unassign(shiftInstanceId, staffId) {
    const state = get()
    set({
      assignments: state.assignments.filter(
        a => !(a.shift_instance_id === shiftInstanceId && a.staff_id === staffId),
      ),
    })
    get().runRulesFor([staffId])
  },

  move(staffId, fromShiftInstanceId, toShiftInstanceId) {
    const state = get()
    if (fromShiftInstanceId === toShiftInstanceId) return
    const toShift = state.shifts.find(s => s.id === toShiftInstanceId)
    if (!toShift) return

    const now = new Date().toISOString()
    const filtered = state.assignments.filter(
      a => !(a.shift_instance_id === fromShiftInstanceId && a.staff_id === staffId),
    )
    // No-op if the staff is already on the target.
    const alreadyOnTarget = filtered.some(
      a => a.shift_instance_id === toShiftInstanceId && a.staff_id === staffId,
    )

    set({
      assignments: alreadyOnTarget
        ? filtered
        : [
            ...filtered,
            {
              id: `pending-${toShiftInstanceId}-${staffId}`,
              shift_instance_id: toShiftInstanceId,
              staff_id: staffId,
              status: 'confirmed' as const,
              source: 'manual' as const,
              created_at: now,
              updated_at: now,
              shift_instance: toShift,
            },
          ],
    })
    get().runRulesFor([staffId])
  },

  swap(aStaffId, aShiftInstanceId, bStaffId, bShiftInstanceId) {
    const state = get()
    const aShift = state.shifts.find(s => s.id === aShiftInstanceId)
    const bShift = state.shifts.find(s => s.id === bShiftInstanceId)
    if (!aShift || !bShift) return

    const now = new Date().toISOString()
    // Strip the two originals AND any pre-existing rows at the destination
    // pairs — otherwise a swap that lands a staff member on a shift they
    // were already on produces a duplicate (shift, staff) row.
    const filtered = state.assignments.filter(
      a =>
        !(a.shift_instance_id === aShiftInstanceId && a.staff_id === aStaffId) &&
        !(a.shift_instance_id === bShiftInstanceId && a.staff_id === bStaffId) &&
        !(a.shift_instance_id === bShiftInstanceId && a.staff_id === aStaffId) &&
        !(a.shift_instance_id === aShiftInstanceId && a.staff_id === bStaffId),
    )

    set({
      assignments: [
        ...filtered,
        {
          id: `pending-${bShiftInstanceId}-${aStaffId}`,
          shift_instance_id: bShiftInstanceId,
          staff_id: aStaffId,
          status: 'confirmed' as const,
          source: 'manual' as const,
          created_at: now,
          updated_at: now,
          shift_instance: bShift,
        },
        {
          id: `pending-${aShiftInstanceId}-${bStaffId}`,
          shift_instance_id: aShiftInstanceId,
          staff_id: bStaffId,
          status: 'confirmed' as const,
          source: 'manual' as const,
          created_at: now,
          updated_at: now,
          shift_instance: aShift,
        },
      ],
    })
    get().runRulesFor([aStaffId, bStaffId])
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
