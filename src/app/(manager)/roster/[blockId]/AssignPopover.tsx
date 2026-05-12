'use client'

import { useState } from 'react'
import { UserPlus, AlertTriangle, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRosterStore } from '@/lib/warnings/rosterStore'
import { cn } from '@/lib/utils'
import type { ShiftType } from '@/types/database'

const SHIFT_LABEL: Record<ShiftType, string> = {
  morning: 'AM',
  afternoon: 'PM',
  night: 'NT',
  ado: 'ADO',
}

interface Props {
  shiftInstanceId: string
  shiftType: ShiftType
  shiftDate: string
  areaId: string
  areaName: string
  onAssign: (staffId: string) => Promise<void>
  trigger?: React.ReactElement
  /** Set false when the trigger is not a native <button> element (e.g. a span). */
  nativeButton?: boolean
}

export default function AssignPopover({ shiftInstanceId, shiftType, shiftDate, areaId, areaName, onAssign, trigger, nativeButton = true }: Props) {
  const allStaff = useRosterStore(s => s.staff)
  const staffAreas = useRosterStore(s => s.staffAreas)
  const assignments = useRosterStore(s => s.assignments)
  const violations = useRosterStore(s => s.violations)

  const [open, setOpen] = useState(false)

  const eligibleStaffIds = new Set(
    staffAreas.filter(sa => sa.area_id === areaId).map(sa => sa.staff_id),
  )
  const staff = allStaff.filter(s => eligibleStaffIds.has(s.id))

  const assignedIds = new Set(
    assignments.filter(a => a.shift_instance_id === shiftInstanceId).map(a => a.staff_id)
  )

  const violationsByStaff = new Map<string, string[]>()
  for (const v of violations) {
    if (v.shiftInstanceId === shiftInstanceId && v.staffId) {
      if (!violationsByStaff.has(v.staffId)) violationsByStaff.set(v.staffId, [])
      violationsByStaff.get(v.staffId)!.push(`${v.name}: ${v.message}`)
    }
  }

  function handleAssign(staffId: string) {
    setOpen(false)
    void onAssign(staffId)
  }

  const d = new Date(shiftDate + 'T00:00:00Z')
  const dateLabel = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`

  const defaultTrigger = (
    <button
      className="inline-flex items-center gap-0.5 rounded border border-dashed px-1 py-px transition-colors leading-tight"
      style={{ borderColor: 'var(--border-strong)', color: 'var(--text-mute)' }}
      title={`Assign staff to ${areaName} ${SHIFT_LABEL[shiftType]} on ${dateLabel}`}
    >
      <UserPlus className="h-2.5 w-2.5" />
      <span className="font-medium">{SHIFT_LABEL[shiftType]}</span>
    </button>
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger nativeButton={nativeButton} render={trigger ?? defaultTrigger} />
      <PopoverContent className="w-56 p-0" side="bottom" align="start">
        <div
          className="px-3 py-2"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
            Assign — {areaName} {SHIFT_LABEL[shiftType]}
          </div>
          <div className="text-[10px]" style={{ color: 'var(--text-mute)' }}>{dateLabel}</div>
        </div>

        {staff.length === 0 ? (
          <div className="px-3 py-3 text-xs" style={{ color: 'var(--text-mute)' }}>No staff eligible for {areaName}</div>
        ) : (
          <ul className="max-h-60 overflow-y-auto py-1">
            {staff.map(member => {
              const isAssigned = assignedIds.has(member.id)
              const memberViolations = violationsByStaff.get(member.id) ?? []

              return (
                <li key={member.id}>
                  <button
                    disabled={isAssigned}
                    onClick={() => handleAssign(member.id)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors',
                      isAssigned ? 'cursor-default' : 'cursor-pointer',
                    )}
                    style={{ color: isAssigned ? 'var(--text-mute)' : 'var(--foreground)' }}
                    onMouseEnter={e => { if (!isAssigned) e.currentTarget.style.background = 'var(--surface-hover)' }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {memberViolations.length > 0 && !isAssigned && (
                        <span title={memberViolations.join('\n')}>
                          <AlertTriangle className="h-3 w-3 shrink-0" style={{ color: 'var(--amber-accent)' }} />
                        </span>
                      )}
                      <span className="truncate">{member.full_name}</span>
                      <span className="shrink-0" style={{ color: 'var(--text-mute)' }}>{(member.fte_target * 100).toFixed(0)}%</span>
                    </span>
                    {isAssigned && <Check className="h-3 w-3 shrink-0" style={{ color: 'var(--green-accent)' }} />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
