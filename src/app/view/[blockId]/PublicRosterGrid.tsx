'use client'

import { cn } from '@/lib/utils'
import type { ShiftType } from '@/types/database'

// ── Constants ─────────────────────────────────────────────────────────────────

const SECTION_ORDER: Exclude<ShiftType, 'ado'>[] = ['night', 'morning', 'afternoon']

const SHIFT_LABEL: Record<string, string> = {
  morning: 'AM',
  afternoon: 'PM',
  night: 'NT',
}

const SECTION_TINT: Record<string, string> = {
  morning: 'bg-blue-50/70 text-blue-700',
  afternoon: 'bg-amber-50/70 text-amber-700',
  night: 'bg-indigo-50/70 text-indigo-700',
}

const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const SECTION_STICKY_TOP = 40

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  return (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7 >= 5
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PublicArea {
  id: string
  name: string
  min_staff_per_shift: number
}

export interface PublicStaff {
  id: string
  full_name: string
  employee_id: string
}

export interface PublicShift {
  id: string
  area_id: string
  shift_type: string
  shift_date: string
}

export interface PublicAssignment {
  shift_instance_id: string
  staff_id: string
}

interface Props {
  startDate: string
  endDate: string
  areas: PublicArea[]
  staff: PublicStaff[]
  shifts: PublicShift[]
  assignments: PublicAssignment[]
  areaId: string | null
  highlight: string | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PublicRosterGrid({
  startDate,
  endDate,
  areas,
  staff,
  shifts,
  assignments,
  areaId,
  highlight,
}: Props) {
  const allDates = datesInRange(startDate, endDate)
  const visibleAreas = areaId ? areas.filter(a => a.id === areaId) : areas

  const shiftByAreaDateType: Record<string, Record<string, Record<string, PublicShift>>> = {}
  for (const s of shifts) {
    if (!shiftByAreaDateType[s.area_id]) shiftByAreaDateType[s.area_id] = {}
    if (!shiftByAreaDateType[s.area_id][s.shift_date]) shiftByAreaDateType[s.area_id][s.shift_date] = {}
    shiftByAreaDateType[s.area_id][s.shift_date][s.shift_type] = s
  }

  const assignmentsByShift: Record<string, string[]> = {}
  for (const a of assignments) {
    if (!assignmentsByShift[a.shift_instance_id]) assignmentsByShift[a.shift_instance_id] = []
    assignmentsByShift[a.shift_instance_id].push(a.staff_id)
  }

  const staffById = new Map(staff.map(s => [s.id, s]))

  const COL_WIDTH = 90

  return (
    <table
      className="border-collapse text-xs"
      style={{ tableLayout: 'fixed', minWidth: `${140 + allDates.length * COL_WIDTH}px` }}
    >
      <colgroup>
        <col style={{ width: 140 }} />
        {allDates.map(d => <col key={d} style={{ width: COL_WIDTH }} />)}
      </colgroup>

      <thead className="sticky top-0 z-30 bg-white">
        <tr>
          <th className="sticky left-0 z-40 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-gray-400 font-normal">
            Area
          </th>
          {allDates.map(date => (
            <th
              key={date}
              className={cn(
                'border-b border-r border-gray-200 px-1 py-1.5 text-center font-medium',
                isWeekend(date) ? 'bg-gray-50 text-gray-500' : 'bg-white text-gray-700',
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
              colSpan={allDates.length + 1}
              className={cn(
                'border-b border-t border-gray-200 px-3 py-1 text-[11px] font-bold uppercase tracking-wider',
                SECTION_TINT[shiftType],
              )}
              style={{ position: 'sticky', top: SECTION_STICKY_TOP, zIndex: 20 }}
            >
              {SHIFT_LABEL[shiftType]}
            </td>
          </tr>,
          ...visibleAreas.map(area => (
            <tr key={`${shiftType}-${area.id}`} className="hover:bg-gray-50/40">
              <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-3 py-1.5 truncate text-gray-700">
                {area.name}
              </td>
              {allDates.map(date => {
                const shift = shiftByAreaDateType[area.id]?.[date]?.[shiftType]
                const assignedIds = shift ? (assignmentsByShift[shift.id] ?? []) : []
                return (
                  <td
                    key={date}
                    className={cn(
                      'border-b border-r border-gray-100 p-1 align-top h-px',
                      isWeekend(date) && 'bg-gray-50/60',
                    )}
                  >
                    {!shift ? (
                      <div className="h-full min-h-[28px] rounded bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgb(243_244_246)_4px,rgb(243_244_246)_5px)]" />
                    ) : (
                      <div className="flex flex-col gap-0.5 min-h-[28px]">
                        {assignedIds.map(staffId => {
                          const member = staffById.get(staffId)
                          if (!member) return null
                          const isDimmed = highlight !== null && member.employee_id !== highlight
                          return (
                            <span
                              key={staffId}
                              className={cn(
                                'flex w-full rounded border px-1.5 py-0.5 text-xs font-medium leading-tight truncate',
                                'bg-white text-gray-700 border-gray-200',
                                isDimmed && 'opacity-30',
                              )}
                            >
                              {member.full_name}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </td>
                )
              })}
            </tr>
          )),
        ])}
      </tbody>
    </table>
  )
}
