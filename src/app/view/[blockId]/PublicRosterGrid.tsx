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

const SECTION_CLASS: Record<string, string> = {
  morning: 'shift-section-am',
  afternoon: 'shift-section-pm',
  night: 'shift-section-nt',
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

      <thead className="sticky top-0 z-30" style={{ background: 'var(--background)' }}>
        <tr>
          <th
            className="sticky left-0 z-40 px-3 py-2 text-left font-normal"
            style={{
              background: 'var(--surface-1)',
              borderBottom: '1px solid var(--border)',
              borderRight: '1px solid var(--border)',
              color: 'var(--text-mute)',
            }}
          >
            Area
          </th>
          {allDates.map(date => (
            <th
              key={date}
              className="px-1 py-1.5 text-center font-medium"
              style={{
                background: isWeekend(date) ? 'var(--surface-1)' : 'var(--background)',
                borderBottom: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                color: isWeekend(date) ? 'var(--text-mute)' : 'var(--text-dim)',
              }}
            >
              <div>{dowAbbr(date)}</div>
              <div className="font-normal" style={{ color: 'var(--text-mute)' }}>{shortDate(date)}</div>
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
                'px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider',
                SECTION_CLASS[shiftType],
              )}
              style={{ position: 'sticky', top: SECTION_STICKY_TOP, zIndex: 20 }}
            >
              {SHIFT_LABEL[shiftType]}
            </td>
          </tr>,
          ...visibleAreas.map(area => (
            <tr key={`${shiftType}-${area.id}`}>
              <td
                className="sticky left-0 z-10 px-3 py-1.5 truncate"
                style={{
                  background: 'var(--card)',
                  borderBottom: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  color: 'var(--text-dim)',
                }}
              >
                {area.name}
              </td>
              {allDates.map(date => {
                const shift = shiftByAreaDateType[area.id]?.[date]?.[shiftType]
                const assignedIds = shift ? (assignmentsByShift[shift.id] ?? []) : []
                return (
                  <td
                    key={date}
                    className="p-1 align-top h-px"
                    style={{
                      borderBottom: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      background: isWeekend(date) ? 'var(--surface-1)' : 'transparent',
                    }}
                  >
                    {!shift ? (
                      <div
                        className="h-full min-h-[28px] rounded"
                        style={{
                          background: 'repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.03) 4px,rgba(255,255,255,0.03) 5px)',
                        }}
                      />
                    ) : (
                      <div className="flex flex-col gap-0.5 min-h-[28px]">
                        {assignedIds.map(staffId => {
                          const member = staffById.get(staffId)
                          if (!member) return null
                          const isDimmed = highlight !== null && member.employee_id !== highlight
                          return (
                            <span
                              key={staffId}
                              className="flex w-full rounded px-1.5 py-0.5 text-xs font-medium leading-tight truncate"
                              style={{
                                background: 'var(--muted)',
                                border: '1px solid var(--border)',
                                color: 'var(--foreground)',
                                opacity: isDimmed ? 0.3 : 1,
                              }}
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
