'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { ShiftType } from '@/types/database'

// ── API response shapes ──────────────────────────────────────────────────────

interface Area {
  id: string
  name: string
  min_staff_per_shift: number
}

interface StaffMember {
  id: string
  full_name: string
  employee_id: string
  primary_area_id: string | null
  fte_target: number
}

interface ShiftInstance {
  id: string
  area_id: string
  shift_type: ShiftType
  shift_date: string
  start_time: string
  end_time: string
  status: string
}

interface Assignment {
  id: string
  shift_instance_id: string
  staff_id: string
  status: string
  source: string
}

interface GridData {
  areas: Area[]
  staff: StaffMember[]
  shifts: ShiftInstance[]
  assignments: Assignment[]
}

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

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  blockId: string
  startDate: string
  endDate: string
}

export default function RosterGrid({ blockId, startDate, endDate }: Props) {
  const [data, setData] = useState<GridData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [weekOffset, setWeekOffset] = useState(0)

  useEffect(() => {
    fetch(`/api/roster/${blockId}/shifts`)
      .then(r => r.json())
      .then((json: GridData & { error?: string }) => {
        if (json.error) { setError(json.error); return }
        setData(json)
      })
      .catch(() => setError('Failed to load roster data'))
  }, [blockId])

  if (error) return (
    <div className="flex flex-1 items-center justify-center text-sm text-red-500">{error}</div>
  )
  if (!data) return (
    <div className="flex flex-1 items-center justify-center text-sm text-gray-400">Loading roster…</div>
  )

  const allDates = datesInRange(startDate, endDate)
  // Week view: show 7 days at a time (0-indexed week within block)
  const totalWeeks = Math.ceil(allDates.length / 7)
  const visibleDates = allDates.slice(weekOffset * 7, weekOffset * 7 + 7)

  // Build lookup: shiftsByAreaDate[areaId][date][shiftType] = ShiftInstance | undefined
  const shiftsByAreaDateType: Record<string, Record<string, Record<string, ShiftInstance>>> = {}
  for (const s of data.shifts) {
    if (!shiftsByAreaDateType[s.area_id]) shiftsByAreaDateType[s.area_id] = {}
    if (!shiftsByAreaDateType[s.area_id][s.shift_date]) shiftsByAreaDateType[s.area_id][s.shift_date] = {}
    shiftsByAreaDateType[s.area_id][s.shift_date][s.shift_type] = s
  }

  // Build lookup: assignmentsByShift[shiftInstanceId] = Assignment[]
  const assignmentsByShift: Record<string, Assignment[]> = {}
  for (const a of data.assignments) {
    if (!assignmentsByShift[a.shift_instance_id]) assignmentsByShift[a.shift_instance_id] = []
    assignmentsByShift[a.shift_instance_id].push(a)
  }

  // Build lookup: staffById
  const staffById: Record<string, StaffMember> = {}
  for (const s of data.staff) staffById[s.id] = s

  // Group staff by primary_area_id; unassigned area goes last
  const staffByArea: Record<string, StaffMember[]> = {}
  const noAreaStaff: StaffMember[] = []
  for (const s of data.staff) {
    if (s.primary_area_id) {
      if (!staffByArea[s.primary_area_id]) staffByArea[s.primary_area_id] = []
      staffByArea[s.primary_area_id].push(s)
    } else {
      noAreaStaff.push(s)
    }
  }

  // Coverage summary for visible dates: (areaId, date) → { filled, required }
  const coverage: Record<string, { filled: number; required: number }> = {}
  for (const area of data.areas) {
    for (const date of visibleDates) {
      const key = `${area.id}:${date}`
      let filled = 0
      let required = 0
      for (const shiftType of SHIFT_ORDER) {
        const shift = shiftsByAreaDateType[area.id]?.[date]?.[shiftType]
        if (!shift) continue
        required += area.min_staff_per_shift
        filled += (assignmentsByShift[shift.id] ?? []).length
      }
      coverage[key] = { filled, required }
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Week navigator */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 shrink-0">
        <button
          className={cn(
            'text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50',
            weekOffset === 0 && 'opacity-30 cursor-not-allowed'
          )}
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
          className={cn(
            'text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50',
            weekOffset >= totalWeeks - 1 && 'opacity-30 cursor-not-allowed'
          )}
          onClick={() => setWeekOffset(w => Math.min(totalWeeks - 1, w + 1))}
          disabled={weekOffset >= totalWeeks - 1}
        >
          Next week →
        </button>
        <div className="flex-1" />
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

          {/* Sticky header */}
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
            {data.areas.map(area => {
              const areaStaff = staffByArea[area.id] ?? []
              return [
                // Area header row
                <tr key={`area-${area.id}`} className="bg-gray-50">
                  <td
                    colSpan={visibleDates.length + 1}
                    className="sticky left-0 border-b border-t border-gray-200 px-3 py-1 font-semibold text-gray-600 bg-gray-50"
                  >
                    {area.name}
                  </td>
                </tr>,

                // Staff rows for this area
                ...areaStaff.map(member => (
                  <tr key={member.id} className="hover:bg-gray-50/50">
                    {/* Sticky name cell */}
                    <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-3 py-1 truncate text-gray-700 hover:bg-gray-50">
                      {member.full_name}
                    </td>

                    {/* Day cells */}
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

                              const shiftAssignments = assignmentsByShift[shift.id] ?? []
                              const isAssigned = shiftAssignments.some(a => a.staff_id === member.id)

                              if (!isAssigned) return null

                              return (
                                <span
                                  key={shiftType}
                                  className={cn(
                                    'inline-block rounded border px-1 py-px font-medium leading-tight',
                                    SHIFT_COLOURS[shiftType]
                                  )}
                                  title={`${area.name} ${shiftType} – ${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)}`}
                                >
                                  {SHIFT_LABEL[shiftType]}
                                </span>
                              )
                            })}
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                )),

                // Open slots row — shows unfilled shift instances for this area
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
                      return assigned < area.min_staff_per_shift
                    })

                    return (
                      <td
                        key={date}
                        className={cn(
                          'border-r border-gray-100 px-0.5 py-0.5 align-top',
                          isWeekend(date) && 'bg-gray-50/60'
                        )}
                      >
                        <div className="flex flex-col gap-0.5">
                          {openShifts.map(shiftType => {
                            const shift = dayShifts[shiftType]!
                            const assigned = (assignmentsByShift[shift.id] ?? []).length
                            const needed = area.min_staff_per_shift - assigned
                            return (
                              <span
                                key={shiftType}
                                className={cn(
                                  'inline-block rounded border border-dashed px-1 py-px leading-tight',
                                  OPEN_COLOURS[shiftType]
                                )}
                                title={`${needed} staff needed`}
                              >
                                {SHIFT_LABEL[shiftType]} −{needed}
                              </span>
                            )
                          })}
                        </div>
                      </td>
                    )
                  })}
                </tr>,
              ]
            })}

            {/* Staff with no primary area */}
            {noAreaStaff.length > 0 && [
              <tr key="no-area-header" className="bg-gray-50">
                <td
                  colSpan={visibleDates.length + 1}
                  className="sticky left-0 border-b border-t border-gray-200 px-3 py-1 font-semibold text-gray-400 bg-gray-50 italic"
                >
                  No area assigned
                </td>
              </tr>,
              ...noAreaStaff.map(member => (
                <tr key={member.id} className="hover:bg-gray-50/50">
                  <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-3 py-1 truncate text-gray-500">
                    {member.full_name}
                  </td>
                  {visibleDates.map(date => (
                    <td key={date} className="border-b border-r border-gray-100 px-0.5 py-0.5" />
                  ))}
                </tr>
              )),
            ]}
          </tbody>
        </table>
      </div>

      {/* Coverage bar */}
      <div className="shrink-0 border-t border-gray-200 px-4 py-2 flex items-center gap-6 overflow-x-auto">
        <span className="text-xs text-gray-400 shrink-0">Coverage</span>
        {data.areas.map(area => {
          const totFilled = visibleDates.reduce((sum, d) => sum + (coverage[`${area.id}:${d}`]?.filled ?? 0), 0)
          const totRequired = visibleDates.reduce((sum, d) => sum + (coverage[`${area.id}:${d}`]?.required ?? 0), 0)
          const pct = totRequired > 0 ? Math.round((totFilled / totRequired) * 100) : 100
          const barColour = pct < 80 ? 'bg-red-400' : pct < 100 ? 'bg-amber-400' : 'bg-green-400'
          return (
            <div key={area.id} className="flex items-center gap-1.5 shrink-0">
              <span className="text-xs text-gray-600">{area.name}</span>
              <div className="w-20 h-1.5 rounded-full bg-gray-200">
                <div
                  className={cn('h-1.5 rounded-full', barColour)}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">{totFilled}/{totRequired}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
