'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'
import type { ShiftType } from '@/types/database'
import { useRosterStore, type RichAssignment } from '@/lib/warnings/rosterStore'
import type { Violation } from '@/lib/rules/types'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip'
import ViolationsPopover from './ViolationsPopover'
import AssignPopover from './AssignPopover'

// ── Constants ────────────────────────────────────────────────────────────────

const SHIFT_ORDER: ShiftType[] = ['morning', 'afternoon', 'night', 'ado']

const SHIFT_LABEL: Record<ShiftType, string> = {
  morning: 'AM',
  afternoon: 'PM',
  night: 'NT',
  ado: 'ADO',
}

const SHIFT_COLOURS: Record<ShiftType, string> = {
  morning: 'bg-blue-100 text-blue-800 border-blue-200',
  afternoon: 'bg-amber-100 text-amber-800 border-amber-200',
  night: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  ado: 'bg-green-100 text-green-800 border-green-200',
}

const OPEN_COLOURS: Record<ShiftType, string> = {
  morning: 'border-blue-300 text-blue-300',
  afternoon: 'border-amber-300 text-amber-300',
  night: 'border-indigo-300 text-indigo-300',
  ado: 'border-green-300 text-green-300',
}

const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

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

// ── Drag ID encoding ─────────────────────────────────────────────────────────
// draggable id: `pill::{shiftInstanceId}::{staffId}`
// droppable id: `cell::{shiftInstanceId}::{staffId}` (target staff row × same shift instance)

function pillId(shiftInstanceId: string, staffId: string) {
  return `pill::${shiftInstanceId}::${staffId}`
}

function cellId(shiftInstanceId: string, staffId: string) {
  return `cell::${shiftInstanceId}::${staffId}`
}

function parsePillId(id: string): { shiftInstanceId: string; staffId: string } | null {
  const parts = id.split('::')
  if (parts[0] !== 'pill' || parts.length !== 3) return null
  return { shiftInstanceId: parts[1], staffId: parts[2] }
}

function parseCellId(id: string): { shiftInstanceId: string; staffId: string } | null {
  const parts = id.split('::')
  if (parts[0] !== 'cell' || parts.length !== 3) return null
  return { shiftInstanceId: parts[1], staffId: parts[2] }
}

// ── ShiftPill ────────────────────────────────────────────────────────────────

interface ShiftPillProps {
  shiftInstanceId: string
  staffId: string
  shiftType: ShiftType
  areaName: string
  startTime: string
  endTime: string
  violations: Violation[]
  isDragOverlay?: boolean
}

function ShiftPill({ shiftInstanceId, staffId, shiftType, areaName, startTime, endTime, violations, isDragOverlay }: ShiftPillProps) {
  const id = pillId(shiftInstanceId, staffId)
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id })

  const hasViolations = violations.length > 0

  const pill = (
    <span
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'inline-flex items-center gap-0.5 rounded border px-1 py-px font-medium leading-tight cursor-grab select-none',
        SHIFT_COLOURS[shiftType],
        isDragging && !isDragOverlay && 'opacity-30',
        isDragOverlay && 'shadow-lg cursor-grabbing rotate-1',
      )}
      title={hasViolations ? undefined : `${areaName} ${shiftType} – ${startTime.slice(0, 5)}–${endTime.slice(0, 5)}`}
    >
      {SHIFT_LABEL[shiftType]}
      {hasViolations && <AlertTriangle className="h-2.5 w-2.5 text-amber-500 shrink-0" />}
    </span>
  )

  if (!hasViolations) return pill

  return (
    <Tooltip>
      <TooltipTrigger render={pill} />
      <TooltipContent side="top" className="max-w-56 whitespace-normal">
        <div className="space-y-1">
          <div className="font-medium">{areaName} {SHIFT_LABEL[shiftType]} – {startTime.slice(0, 5)}–{endTime.slice(0, 5)}</div>
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

// ── DropCell ─────────────────────────────────────────────────────────────────

interface DropCellProps {
  shiftInstanceId: string
  staffId: string
  isOccupied: boolean
  children: React.ReactNode
}

function DropCell({ shiftInstanceId, staffId, isOccupied, isHighlighted, children }: DropCellProps & { isHighlighted?: boolean }) {
  const id = cellId(shiftInstanceId, staffId)
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'min-h-[20px] rounded transition-colors',
        isOver && !isOccupied && 'bg-blue-50 ring-1 ring-blue-300',
        isOver && isOccupied && 'bg-amber-50 ring-1 ring-amber-300',
        isHighlighted && 'ring-2 ring-amber-400 bg-amber-50',
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

interface ApiGridData {
  block: { id: string; start_date: string; end_date: string }
  areas: ApiArea[]
  staff: ApiStaff[]
  shifts: ApiShift[]
  assignments: RichAssignment[]
  leaveRequests: unknown[]
  availability: unknown[]
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
  const [activeDrag, setActiveDrag] = useState<{ shiftInstanceId: string; staffId: string; shiftType: ShiftType; areaName: string; startTime: string; endTime: string } | null>(null)

  // Pending DB writes: map of `${shiftInstanceId}::${fromStaffId}::${toStaffId}` → status
  const pendingWrites = useRef<Map<string, 'pending' | 'error'>>(new Map())
  const [, forceUpdate] = useState(0)

  const hydrate = useRosterStore(s => s.hydrate)
  const assign = useRosterStore(s => s.assign)
  const reassign = useRosterStore(s => s.reassign)
  const assignments = useRosterStore(s => s.assignments)
  const violations = useRosterStore(s => s.violations)
  const storeAreas = useRosterStore(s => s.areas)
  const storeStaff = useRosterStore(s => s.staff)
  const storeShifts = useRosterStore(s => s.shifts)
  const isHydrated = useRosterStore(s => s.blockId === blockId)
  const highlightedShiftId = useRosterStore(s => s.highlightedShiftId)

  useEffect(() => {
    fetch(`/api/roster/${blockId}/shifts`)
      .then(r => r.json())
      .then((json: ApiGridData & { error?: string }) => {
        if (json.error) { setError(json.error); return }
        hydrate({
          blockId,
          blockStart: json.block.start_date,
          blockEnd: json.block.end_date,
          staff: json.staff as never,
          shifts: json.shifts as never,
          areas: json.areas as never,
          assignments: json.assignments,
          leaveRequests: json.leaveRequests as never,
          availability: json.availability as never,
        })
      })
      .catch(() => setError('Failed to load roster data'))
  }, [blockId, hydrate])

  const persistAssign = useCallback(async (shiftInstanceId: string, staffId: string) => {
    const key = `${shiftInstanceId}::${staffId}`
    pendingWrites.current.set(key, 'pending')
    forceUpdate(n => n + 1)

    const res = await fetch(`/api/roster/${blockId}/assignments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftInstanceId, staffId }),
    })

    if (!res.ok) {
      pendingWrites.current.set(key, 'error')
    } else {
      pendingWrites.current.delete(key)
    }
    forceUpdate(n => n + 1)
  }, [blockId])

  const persistReassign = useCallback(async (shiftInstanceId: string, fromStaffId: string, toStaffId: string) => {
    const key = `${shiftInstanceId}::${fromStaffId}::${toStaffId}`
    pendingWrites.current.set(key, 'pending')
    forceUpdate(n => n + 1)

    const res = await fetch(`/api/roster/${blockId}/assignments`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shiftInstanceId, fromStaffId, toStaffId }),
    })

    if (!res.ok) {
      pendingWrites.current.set(key, 'error')
    } else {
      pendingWrites.current.delete(key)
    }
    forceUpdate(n => n + 1)
  }, [blockId])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function onDragStart(event: DragStartEvent) {
    const parsed = parsePillId(String(event.active.id))
    if (!parsed) return
    const shift = storeShifts.find(s => s.id === parsed.shiftInstanceId)
    const area = storeAreas.find(a => a.id === shift?.area_id)
    if (!shift || !area) return
    setActiveDrag({
      shiftInstanceId: parsed.shiftInstanceId,
      staffId: parsed.staffId,
      shiftType: shift.shift_type as ShiftType,
      areaName: area.name,
      startTime: shift.start_time,
      endTime: shift.end_time,
    })
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveDrag(null)
    if (!event.over) return

    const drag = parsePillId(String(event.active.id))
    const drop = parseCellId(String(event.over.id))
    if (!drag || !drop) return

    // Must be same shift instance, different staff
    if (drag.shiftInstanceId !== drop.shiftInstanceId) return
    if (drag.staffId === drop.staffId) return

    // Optimistic update in store
    reassign(drag.shiftInstanceId, drag.staffId, drop.staffId)

    // Persist to DB
    persistReassign(drag.shiftInstanceId, drag.staffId, drop.staffId)
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

  // Build lookup: shiftsByAreaDateType[areaId][date][shiftType]
  const shiftsByAreaDateType: Record<string, Record<string, Record<string, ApiShift>>> = {}
  for (const s of storeShifts) {
    if (!shiftsByAreaDateType[s.area_id]) shiftsByAreaDateType[s.area_id] = {}
    if (!shiftsByAreaDateType[s.area_id][s.shift_date]) shiftsByAreaDateType[s.area_id][s.shift_date] = {}
    shiftsByAreaDateType[s.area_id][s.shift_date][s.shift_type] = s as ApiShift
  }

  // Build lookup: assignmentsByShift[shiftInstanceId] = RichAssignment[]
  const assignmentsByShift: Record<string, RichAssignment[]> = {}
  for (const a of assignments) {
    if (!assignmentsByShift[a.shift_instance_id]) assignmentsByShift[a.shift_instance_id] = []
    assignmentsByShift[a.shift_instance_id].push(a)
  }

  // Build lookup: violationsByStaffAndShift[staffId][shiftInstanceId]
  const violationsByStaffAndShift: Record<string, Record<string, Violation[]>> = {}
  for (const v of violations) {
    if (!v.staffId || !v.shiftInstanceId) continue
    if (!violationsByStaffAndShift[v.staffId]) violationsByStaffAndShift[v.staffId] = {}
    if (!violationsByStaffAndShift[v.staffId][v.shiftInstanceId]) violationsByStaffAndShift[v.staffId][v.shiftInstanceId] = []
    violationsByStaffAndShift[v.staffId][v.shiftInstanceId].push(v)
  }

  // Group staff by their assigned areas across the full block
  const staffAreaIds: Record<string, Set<string>> = {}
  for (const a of assignments) {
    const shift = storeShifts.find(s => s.id === a.shift_instance_id)
    if (!shift) continue
    if (!staffAreaIds[a.staff_id]) staffAreaIds[a.staff_id] = new Set()
    staffAreaIds[a.staff_id].add(shift.area_id)
  }
  const staffByArea: Record<string, typeof storeStaff> = {}
  for (const s of storeStaff) {
    const areaIds = staffAreaIds[s.id]
    if (areaIds && areaIds.size > 0) {
      for (const areaId of areaIds) {
        if (!staffByArea[areaId]) staffByArea[areaId] = []
        staffByArea[areaId].push(s)
      }
    } else if (storeAreas.length > 0) {
      const firstAreaId = storeAreas[0].id
      if (!staffByArea[firstAreaId]) staffByArea[firstAreaId] = []
      staffByArea[firstAreaId].push(s)
    }
  }

  // Coverage for visible dates
  const coverage: Record<string, { filled: number; required: number }> = {}
  for (const area of storeAreas) {
    for (const date of visibleDates) {
      const key = `${area.id}:${date}`
      let filled = 0; let required = 0
      for (const shiftType of SHIFT_ORDER) {
        const shift = shiftsByAreaDateType[area.id]?.[date]?.[shiftType]
        if (!shift) continue
        required += (area as ApiArea).min_staff_per_shift
        filled += (assignmentsByShift[shift.id] ?? []).length
      }
      coverage[key] = { filled, required }
    }
  }

  // Pending write indicator
  const hasPendingWrites = [...pendingWrites.current.values()].some(s => s === 'pending')
  const hasWriteErrors = [...pendingWrites.current.values()].some(s => s === 'error')

  return (
    <TooltipProvider delay={400}>
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

          {/* Save status */}
          {hasPendingWrites && <span className="text-xs text-gray-400">Saving…</span>}
          {hasWriteErrors && <span className="text-xs text-red-500">Save failed — reload to retry</span>}

          {/* Violations bell */}
          <ViolationsPopover
            onJumpToWeek={setWeekOffset}
            blockStart={startDate}
          />

          {/* Shift legend */}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            {SHIFT_ORDER.filter(t => t !== 'ado').map(t => (
              <span key={t} className={cn('px-1.5 py-0.5 rounded border font-medium', SHIFT_COLOURS[t])}>
                {SHIFT_LABEL[t]}
              </span>
            ))}
            <span className={cn('px-1.5 py-0.5 rounded border font-medium', SHIFT_COLOURS.ado)}>ADO</span>
            <span className="px-1.5 py-0.5 rounded border border-dashed border-gray-300 text-gray-300">Open</span>
          </div>
        </div>

        {/* Scrollable grid */}
        <div className="flex-1 overflow-auto">
          <table className="border-collapse text-xs w-full" style={{ tableLayout: 'fixed', minWidth: `${140 + visibleDates.length * 88}px` }}>
            <colgroup>
              <col style={{ width: 140 }} />
              {visibleDates.map(d => <col key={d} style={{ width: 88 }} />)}
            </colgroup>

            <thead className="sticky top-0 z-20 bg-white">
              <tr>
                <th className="sticky left-0 z-30 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-gray-400 font-normal">
                  Staff
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
              {storeAreas.map(area => {
                const areaStaff = staffByArea[area.id] ?? []
                return [
                  <tr key={`area-${area.id}`} className="bg-gray-50">
                    <td
                      colSpan={visibleDates.length + 1}
                      className="sticky left-0 border-b border-t border-gray-200 px-3 py-1 font-semibold text-gray-600 bg-gray-50"
                    >
                      {area.name}
                    </td>
                  </tr>,

                  ...areaStaff.map(member => (
                    <tr key={`${area.id}-${member.id}`} className="hover:bg-gray-50/50">
                      <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-3 py-1 truncate text-gray-700 hover:bg-gray-50">
                        {member.full_name}
                      </td>

                      {visibleDates.map(date => {
                        const dayShifts = shiftsByAreaDateType[area.id]?.[date] ?? {}
                        return (
                          <td
                            key={date}
                            className={cn(
                              'border-b border-r border-gray-100 px-0.5 py-0.5 align-top',
                              isWeekend(date) && 'bg-gray-50/60'
                            )}
                          >
                            <div className="flex flex-col gap-0.5">
                              {SHIFT_ORDER.map(shiftType => {
                                const shift = dayShifts[shiftType]
                                if (!shift) return null
                                const isAssigned = (assignmentsByShift[shift.id] ?? []).some(a => a.staff_id === member.id)
                                const pillViolations = violationsByStaffAndShift[member.id]?.[shift.id] ?? []

                                return (
                                  <DropCell
                                    key={shiftType}
                                    shiftInstanceId={shift.id}
                                    staffId={member.id}
                                    isOccupied={isAssigned}
                                    isHighlighted={highlightedShiftId === shift.id}
                                  >
                                    {isAssigned && (
                                      <ShiftPill
                                        shiftInstanceId={shift.id}
                                        staffId={member.id}
                                        shiftType={shiftType}
                                        areaName={area.name}
                                        startTime={shift.start_time}
                                        endTime={shift.end_time}
                                        violations={pillViolations}
                                      />
                                    )}
                                  </DropCell>
                                )
                              })}
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  )),

                  <tr key={`open-${area.id}`} className="border-b border-gray-100">
                    <td className="sticky left-0 z-10 border-r border-gray-100 bg-white px-3 py-1 text-gray-400 italic">
                      Open slots
                    </td>
                    {visibleDates.map(date => {
                      const dayShifts = shiftsByAreaDateType[area.id]?.[date] ?? {}
                      const openShifts = SHIFT_ORDER.filter(shiftType => {
                        const shift = dayShifts[shiftType]
                        if (!shift) return false
                        const assigned = (assignmentsByShift[shift.id] ?? []).length
                        return assigned < (area as ApiArea).min_staff_per_shift
                      })
                      return (
                        <td
                          key={date}
                          className={cn('border-r border-gray-100 px-0.5 py-0.5 align-top', isWeekend(date) && 'bg-gray-50/60')}
                        >
                          <div className="flex flex-col gap-0.5">
                            {openShifts.map(shiftType => {
                              const shift = dayShifts[shiftType]!
                              return (
                                <AssignPopover
                                  key={shiftType}
                                  shiftInstanceId={shift.id}
                                  shiftType={shiftType}
                                  shiftDate={date}
                                  areaName={area.name}
                                  onAssign={async (staffId) => {
                                    assign(shift.id, staffId)
                                    await persistAssign(shift.id, staffId)
                                  }}
                                />
                              )
                            })}
                          </div>
                        </td>
                      )
                    })}
                  </tr>,
                ]
              })}
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

      {/* Drag overlay — ghost pill while dragging */}
      <DragOverlay>
        {activeDrag && (
          <ShiftPill
            shiftInstanceId={activeDrag.shiftInstanceId}
            staffId={activeDrag.staffId}
            shiftType={activeDrag.shiftType}
            areaName={activeDrag.areaName}
            startTime={activeDrag.startTime}
            endTime={activeDrag.endTime}
            violations={[]}
            isDragOverlay
          />
        )}
      </DragOverlay>
    </DndContext>
    </TooltipProvider>
  )
}
