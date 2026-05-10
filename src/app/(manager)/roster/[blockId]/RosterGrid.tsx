'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { AlertTriangle, Plus, X } from 'lucide-react'
import type { ShiftType } from '@/types/database'
import { useRosterStore } from '@/lib/warnings/rosterStore'
import type { Violation } from '@/lib/rules/types'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import ViolationsPopover from './ViolationsPopover'
import AssignPopover from './AssignPopover'

// ── Constants ────────────────────────────────────────────────────────────────

const SECTION_ORDER: Exclude<ShiftType, 'ado'>[] = ['morning', 'afternoon', 'night']

const SHIFT_LABEL: Record<ShiftType, string> = {
  morning: 'AM',
  afternoon: 'PM',
  night: 'NT',
  ado: 'ADO',
}

const SECTION_TINT: Record<Exclude<ShiftType, 'ado'>, string> = {
  morning: 'bg-blue-50/70 text-blue-700',
  afternoon: 'bg-amber-50/70 text-amber-700',
  night: 'bg-indigo-50/70 text-indigo-700',
}

const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Sticky offset (in px) below the date row where section headers anchor.
const SECTION_STICKY_TOP = 40

// ── Helpers ──────────────────────────────────────────────────────────────────

function datesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T00:00:00Z')
  const last = new Date(end + 'T00:00:00Z')
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

function dowAbbr(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  return DAY_ABBR[(d.getUTCDay() + 6) % 7]
}

function shortDate(date: string): string {
  const d = new Date(date + 'T00:00:00Z')
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}

function isWeekend(date: string): boolean {
  const dow = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7
  return dow >= 5
}

// ── Drag/drop ID encoding ────────────────────────────────────────────────────
//   draggable: `chip::{shiftInstanceId}::{staffId}`
//   cell drop: `cell::{shiftInstanceId}`        (move target — empty cell space)
//   chip drop: `swap::{shiftInstanceId}::{staffId}` (swap target — another chip)

function chipDragId(shiftInstanceId: string, staffId: string) {
  return `chip::${shiftInstanceId}::${staffId}`
}
function cellDropId(shiftInstanceId: string) {
  return `cell::${shiftInstanceId}`
}
function swapDropId(shiftInstanceId: string, staffId: string) {
  return `swap::${shiftInstanceId}::${staffId}`
}

function parseChipId(id: string): { shiftInstanceId: string; staffId: string } | null {
  const parts = id.split('::')
  if (parts[0] !== 'chip' || parts.length !== 3) return null
  return { shiftInstanceId: parts[1], staffId: parts[2] }
}

// ── StaffChip ────────────────────────────────────────────────────────────────

interface StaffChipProps {
  shiftInstanceId: string
  staffId: string
  fullName: string
  violations: Violation[]
  isHighlighted: boolean
  onRemove: () => void
  isDragOverlay?: boolean
}

function StaffChip({
  shiftInstanceId,
  staffId,
  fullName,
  violations,
  isHighlighted,
  onRemove,
  isDragOverlay,
}: StaffChipProps) {
  const dragId = chipDragId(shiftInstanceId, staffId)
  const drag = useDraggable({ id: dragId, disabled: isDragOverlay })
  const drop = useDroppable({ id: swapDropId(shiftInstanceId, staffId), disabled: isDragOverlay })

  const setRef = (el: HTMLElement | null) => {
    drag.setNodeRef(el)
    drop.setNodeRef(el)
  }

  const hasViolations = violations.length > 0

  const chip = (
    <span
      ref={setRef}
      {...drag.listeners}
      {...drag.attributes}
      className={cn(
        'group/chip relative flex w-full items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium leading-tight cursor-grab select-none',
        'bg-white text-gray-700 border-gray-200 hover:border-gray-300',
        hasViolations && 'border-amber-300 bg-amber-50 text-amber-900',
        isHighlighted && 'ring-2 ring-amber-400',
        drag.isDragging && !isDragOverlay && 'opacity-30',
        drop.isOver && !isDragOverlay && 'ring-2 ring-blue-400',
        isDragOverlay && 'shadow-lg cursor-grabbing rotate-1',
      )}
    >
      {hasViolations && <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />}
      <span className="truncate flex-1 min-w-0">{fullName}</span>
      {!isDragOverlay && (
        <button
          type="button"
          aria-label={`Remove ${fullName}`}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            onRemove()
          }}
          className="ml-auto shrink-0 inline-flex items-center justify-center rounded-sm opacity-0 group-hover/chip:opacity-100 hover:bg-gray-200 transition-opacity"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  )

  if (!hasViolations || isDragOverlay) return chip

  return (
    <Tooltip>
      <TooltipTrigger render={chip} />
      <TooltipContent side="top" className="max-w-56 whitespace-normal">
        <div className="space-y-1">
          <div className="font-medium">{fullName}</div>
          {violations.map((v, i) => (
            <div key={i} className="flex items-start gap-1 opacity-90">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0 text-amber-300" />
              <span>{v.message}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// ── CellDropZone ─────────────────────────────────────────────────────────────
// The cell's "background" drop target — accepts a chip dropped on empty space.

function CellDropZone({
  shiftInstanceId,
  children,
  className,
}: {
  shiftInstanceId: string
  children: React.ReactNode
  className?: string
}) {
  const { setNodeRef, isOver } = useDroppable({ id: cellDropId(shiftInstanceId) })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col gap-0.5 min-h-[28px] rounded transition-colors',
        isOver && 'bg-blue-50 ring-1 ring-blue-300',
        className,
      )}
    >
      {children}
    </div>
  )
}

// ── API shapes ───────────────────────────────────────────────────────────────

interface ApiArea {
  id: string
  name: string
  min_staff_per_shift: number
}
interface ApiStaff {
  id: string
  full_name: string
  employee_id: string
  fte_target: number
  is_active: boolean
  email: string
  phone: string | null
  created_at: string
}
interface ApiShift {
  id: string
  area_id: string
  shift_type: ShiftType
  shift_date: string
  start_time: string
  end_time: string
  status: string
}

// ── RosterGrid ───────────────────────────────────────────────────────────────

interface Props {
  blockId: string
  startDate: string
  endDate: string
}

export default function RosterGrid({ blockId, startDate, endDate }: Props) {
  const [error, setError] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)
  const [activeDrag, setActiveDrag] = useState<{
    shiftInstanceId: string
    staffId: string
    fullName: string
  } | null>(null)

  // Pending DB writes — keyed by an op-specific string.
  const pendingWrites = useRef<Map<string, 'pending' | 'error'>>(new Map())
  const [, forceUpdate] = useState(0)

  const hydrate = useRosterStore(s => s.hydrate)
  const assignAction = useRosterStore(s => s.assign)
  const unassignAction = useRosterStore(s => s.unassign)
  const moveAction = useRosterStore(s => s.move)
  const swapAction = useRosterStore(s => s.swap)
  const assignments = useRosterStore(s => s.assignments)
  const violations = useRosterStore(s => s.violations)
  const storeAreas = useRosterStore(s => s.areas)
  const storeStaff = useRosterStore(s => s.staff)
  const storeShifts = useRosterStore(s => s.shifts)
  const isHydrated = useRosterStore(s => s.blockId === blockId)
  const highlightedCell = useRosterStore(s => s.highlightedCell)

  useEffect(() => {
    fetch(`/api/roster/${blockId}/shifts`)
      .then(r => r.json())
      .then((json: {
        block: { id: string; start_date: string; end_date: string }
        areas: unknown
        staff: unknown
        shifts: unknown
        assignments: unknown
        leaveRequests: unknown
        availability: unknown
        staffAreas: unknown
        error?: string
      }) => {
        if (json.error) { setError(json.error); return }
        hydrate({
          blockId,
          blockStart: json.block.start_date,
          blockEnd: json.block.end_date,
          staff: json.staff as never,
          shifts: json.shifts as never,
          areas: json.areas as never,
          staffAreas: json.staffAreas as never,
          assignments: json.assignments as never,
          leaveRequests: json.leaveRequests as never,
          availability: json.availability as never,
        })
      })
      .catch(() => setError('Failed to load roster data'))
  }, [blockId, hydrate])

  const trackWrite = useCallback(async (key: string, run: () => Promise<Response>) => {
    pendingWrites.current.set(key, 'pending')
    forceUpdate(n => n + 1)
    try {
      const res = await run()
      if (!res.ok) pendingWrites.current.set(key, 'error')
      else pendingWrites.current.delete(key)
    } catch {
      pendingWrites.current.set(key, 'error')
    }
    forceUpdate(n => n + 1)
  }, [])

  const persistAssign = useCallback((shiftInstanceId: string, staffId: string) => {
    return trackWrite(`assign::${shiftInstanceId}::${staffId}`, () =>
      fetch(`/api/roster/${blockId}/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftInstanceId, staffId }),
      }),
    )
  }, [blockId, trackWrite])

  const persistUnassign = useCallback((shiftInstanceId: string, staffId: string) => {
    return trackWrite(`unassign::${shiftInstanceId}::${staffId}`, () =>
      fetch(`/api/roster/${blockId}/assignments`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shiftInstanceId, staffId }),
      }),
    )
  }, [blockId, trackWrite])

  const persistMove = useCallback((staffId: string, fromShiftInstanceId: string, toShiftInstanceId: string) => {
    return trackWrite(`move::${staffId}::${fromShiftInstanceId}::${toShiftInstanceId}`, () =>
      fetch(`/api/roster/${blockId}/assignments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'move', staffId, fromShiftInstanceId, toShiftInstanceId }),
      }),
    )
  }, [blockId, trackWrite])

  const persistSwap = useCallback((aStaffId: string, aShiftInstanceId: string, bStaffId: string, bShiftInstanceId: string) => {
    return trackWrite(`swap::${aStaffId}::${aShiftInstanceId}::${bStaffId}::${bShiftInstanceId}`, () =>
      fetch(`/api/roster/${blockId}/assignments`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ op: 'swap', aStaffId, aShiftInstanceId, bStaffId, bShiftInstanceId }),
      }),
    )
  }, [blockId, trackWrite])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function onDragStart(event: DragStartEvent) {
    const parsed = parseChipId(String(event.active.id))
    if (!parsed) return
    const member = storeStaff.find(s => s.id === parsed.staffId)
    if (!member) return
    setActiveDrag({
      shiftInstanceId: parsed.shiftInstanceId,
      staffId: parsed.staffId,
      fullName: member.full_name,
    })
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    if (!event.over) return

    const drag = parseChipId(String(event.active.id))
    if (!drag) return

    const overId = String(event.over.id)

    // Cell-background drop → move
    if (overId.startsWith('cell::')) {
      const targetShiftInstanceId = overId.slice('cell::'.length)
      if (!targetShiftInstanceId || targetShiftInstanceId === drag.shiftInstanceId) return
      // No-op if staff is already on the target shift
      if (assignments.some(a => a.shift_instance_id === targetShiftInstanceId && a.staff_id === drag.staffId)) return
      moveAction(drag.staffId, drag.shiftInstanceId, targetShiftInstanceId)
      persistMove(drag.staffId, drag.shiftInstanceId, targetShiftInstanceId)
      return
    }

    // Chip drop → swap
    if (overId.startsWith('swap::')) {
      const parts = overId.split('::')
      if (parts.length !== 3) return
      const targetShift = parts[1]
      const targetStaff = parts[2]
      // No-op if dropping on self, or onto same staff member's other chip
      if (targetShift === drag.shiftInstanceId && targetStaff === drag.staffId) return
      if (targetStaff === drag.staffId) return
      // No-op if both staff are already on each other's target shifts (cycle)
      swapAction(drag.staffId, drag.shiftInstanceId, targetStaff, targetShift)
      persistSwap(drag.staffId, drag.shiftInstanceId, targetStaff, targetShift)
      return
    }
  }

  if (error) return (
    <div className="flex flex-1 items-center justify-center text-sm text-red-500">{error}</div>
  )
  if (!isHydrated) return (
    <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Loading roster…</div>
  )

  const allDates = datesInRange(startDate, endDate)
  const totalWeeks = Math.ceil(allDates.length / 7)
  const visibleDates = allDates.slice(weekOffset * 7, weekOffset * 7 + 7)

  // Lookup: shiftByAreaDateType[areaId][date][shiftType]
  const shiftByAreaDateType: Record<string, Record<string, Partial<Record<ShiftType, ApiShift>>>> = {}
  for (const s of storeShifts) {
    if (!shiftByAreaDateType[s.area_id]) shiftByAreaDateType[s.area_id] = {}
    if (!shiftByAreaDateType[s.area_id][s.shift_date]) shiftByAreaDateType[s.area_id][s.shift_date] = {}
    shiftByAreaDateType[s.area_id][s.shift_date][s.shift_type as ShiftType] = s as ApiShift
  }

  // Lookup: assignmentsByShift[shiftInstanceId] = staff_id[]
  const assignmentsByShift: Record<string, string[]> = {}
  for (const a of assignments) {
    if (!assignmentsByShift[a.shift_instance_id]) assignmentsByShift[a.shift_instance_id] = []
    assignmentsByShift[a.shift_instance_id].push(a.staff_id)
  }

  // Lookup: violationsByStaffAndShift[staffId][shiftInstanceId]
  const violationsByStaffAndShift: Record<string, Record<string, Violation[]>> = {}
  for (const v of violations) {
    if (!v.staffId || !v.shiftInstanceId) continue
    if (!violationsByStaffAndShift[v.staffId]) violationsByStaffAndShift[v.staffId] = {}
    if (!violationsByStaffAndShift[v.staffId][v.shiftInstanceId]) violationsByStaffAndShift[v.staffId][v.shiftInstanceId] = []
    violationsByStaffAndShift[v.staffId][v.shiftInstanceId].push(v)
  }

  const staffById = new Map(storeStaff.map(s => [s.id, s]))

  // Coverage for visible dates (per area, summed across all shift types)
  const coverage: Record<string, { filled: number; required: number }> = {}
  for (const area of storeAreas) {
    for (const date of visibleDates) {
      const key = `${area.id}:${date}`
      let filled = 0; let required = 0
      for (const shiftType of SECTION_ORDER) {
        const shift = shiftByAreaDateType[area.id]?.[date]?.[shiftType]
        if (!shift) continue
        required += (area as ApiArea).min_staff_per_shift
        filled += (assignmentsByShift[shift.id] ?? []).length
      }
      coverage[key] = { filled, required }
    }
  }

  const hasPendingWrites = [...pendingWrites.current.values()].some(s => s === 'pending')
  const hasWriteErrors = [...pendingWrites.current.values()].some(s => s === 'error')

  return (
    <TooltipProvider delay={120}>
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex flex-col flex-1 min-h-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 shrink-0">
          <button
            className={cn('text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50', weekOffset === 0 && 'opacity-30 cursor-not-allowed')}
            onClick={() => setWeekOffset(w => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
          >
            ← Prev week
          </button>
          <span className="text-xs text-gray-500">
            Week {weekOffset + 1} of {totalWeeks}
            {visibleDates.length > 0 && (
              <> &nbsp;({shortDate(visibleDates[0])} – {shortDate(visibleDates[visibleDates.length - 1])})</>
            )}
          </span>
          <button
            className={cn('text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50', weekOffset >= totalWeeks - 1 && 'opacity-30 cursor-not-allowed')}
            onClick={() => setWeekOffset(w => Math.min(totalWeeks - 1, w + 1))}
            disabled={weekOffset >= totalWeeks - 1}
          >
            Next week →
          </button>

          <div className="flex-1" />

          {hasPendingWrites && <span className="text-xs text-gray-400">Saving…</span>}
          {hasWriteErrors && <span className="text-xs text-red-500">Save failed — reload to retry</span>}

          <ViolationsPopover
            onJumpToWeek={setWeekOffset}
            blockStart={startDate}
          />
        </div>

        {/* Scrollable grid */}
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs w-full" style={{ tableLayout: 'fixed', minWidth: `${140 + visibleDates.length * 110}px` }}>
            <colgroup>
              <col style={{ width: 140 }} />
              {visibleDates.map(d => <col key={d} style={{ width: 110 }} />)}
            </colgroup>

            <thead className="sticky top-0 z-30 bg-white">
              <tr>
                <th className="sticky left-0 z-40 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-gray-400 font-normal">
                  Area
                </th>
                {visibleDates.map(date => (
                  <th
                    key={date}
                    className={cn(
                      'border-b border-r border-gray-200 px-1 py-1.5 text-center font-medium',
                      isWeekend(date) ? 'bg-gray-50 text-gray-500' : 'bg-white text-gray-700'
                    )}
                  >
                    <div>{dowAbbr(date)}</div>
                    <div className="font-normal text-gray-400">{shortDate(date)}</div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {SECTION_ORDER.flatMap(shiftType => [
                <tr key={`section-${shiftType}`}>
                  <td
                    colSpan={visibleDates.length + 1}
                    className={cn(
                      'border-b border-t border-gray-200 px-3 py-1 text-[11px] font-bold uppercase tracking-wider',
                      SECTION_TINT[shiftType],
                    )}
                    style={{ position: 'sticky', top: SECTION_STICKY_TOP, zIndex: 20 }}
                  >
                    {SHIFT_LABEL[shiftType]}
                  </td>
                </tr>,
                ...storeAreas.map(area => (
                  <tr key={`${shiftType}-${area.id}`} className="hover:bg-gray-50/40">
                    <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-3 py-1.5 truncate text-gray-700">
                      {area.name}
                    </td>

                    {visibleDates.map(date => {
                      const shift = shiftByAreaDateType[area.id]?.[date]?.[shiftType]
                      const assignedIds = shift ? (assignmentsByShift[shift.id] ?? []) : []
                      const required = (area as ApiArea).min_staff_per_shift
                      const filled = assignedIds.length
                      const isFullyFilled = !!shift && required > 0 && filled >= required

                      return (
                        <td
                          key={date}
                          className={cn(
                            'border-b border-r border-gray-100 p-1 align-top group',
                            isWeekend(date) && 'bg-gray-50/60',
                            isFullyFilled && 'bg-green-50',
                          )}
                        >
                          {!shift ? (
                            <div className="min-h-[28px] rounded bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgb(243_244_246)_4px,rgb(243_244_246)_5px)]" />
                          ) : (
                            <CellDropZone shiftInstanceId={shift.id}>
                              {assignedIds.map(staffId => {
                                const member = staffById.get(staffId)
                                if (!member) return null
                                const isHighlighted =
                                  highlightedCell?.shiftInstanceId === shift.id &&
                                  highlightedCell?.staffId === staffId
                                return (
                                  <StaffChip
                                    key={staffId}
                                    shiftInstanceId={shift.id}
                                    staffId={staffId}
                                    fullName={member.full_name}
                                    violations={violationsByStaffAndShift[staffId]?.[shift.id] ?? []}
                                    isHighlighted={!!isHighlighted}
                                    onRemove={() => {
                                      unassignAction(shift.id, staffId)
                                      persistUnassign(shift.id, staffId)
                                    }}
                                  />
                                )
                              })}

                              <AssignPopover
                                shiftInstanceId={shift.id}
                                shiftType={shiftType}
                                shiftDate={date}
                                areaId={area.id}
                                areaName={area.name}
                                onAssign={async (staffId) => {
                                  assignAction(shift.id, staffId)
                                  await persistAssign(shift.id, staffId)
                                }}
                                trigger={
                                  <button
                                    type="button"
                                    className="flex items-center justify-center gap-1 rounded border border-dashed border-gray-300 px-1 py-0.5 text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
                                    title={`Assign staff to ${area.name} ${SHIFT_LABEL[shiftType]} on ${shortDate(date)}`}
                                  >
                                    <Plus className="h-3 w-3" />
                                    <span>Add</span>
                                  </button>
                                }
                              />
                            </CellDropZone>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>

        {/* Coverage bar */}
        <div className="shrink-0 border-t border-gray-200 px-4 py-2 flex items-center gap-6 overflow-x-auto">
          <span className="text-xs text-gray-400 shrink-0">Coverage</span>
          {storeAreas.map(area => {
            const totFilled = visibleDates.reduce((sum, d) => sum + (coverage[`${area.id}:${d}`]?.filled ?? 0), 0)
            const totRequired = visibleDates.reduce((sum, d) => sum + (coverage[`${area.id}:${d}`]?.required ?? 0), 0)
            const pct = totRequired > 0 ? Math.round((totFilled / totRequired) * 100) : 100
            const barColour = pct < 80 ? 'bg-red-400' : pct < 100 ? 'bg-amber-400' : 'bg-green-400'
            return (
              <div key={area.id} className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-600">{area.name}</span>
                <div className="w-20 h-1.5 rounded-full bg-gray-200">
                  <div className={cn('h-1.5 rounded-full', barColour)} style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <span className="text-xs text-gray-400">{totFilled}/{totRequired}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Drag overlay */}
      <DragOverlay>
        {activeDrag && (
          <StaffChip
            shiftInstanceId={activeDrag.shiftInstanceId}
            staffId={activeDrag.staffId}
            fullName={activeDrag.fullName}
            violations={[]}
            isHighlighted={false}
            onRemove={() => {}}
            isDragOverlay
          />
        )}
      </DragOverlay>
    </DndContext>
    </TooltipProvider>
  )
}

