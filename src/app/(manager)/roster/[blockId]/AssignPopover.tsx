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
  areaName: string
  onAssign: (staffId: string) => Promise<void>
}

export default function AssignPopover({ shiftInstanceId, shiftType, shiftDate, areaName, onAssign }: Props) {
  const staff = useRosterStore(s => s.staff)
  const assignments = useRosterStore(s => s.assignments)
  const violations = useRosterStore(s => s.violations)

  const [loading, setLoading] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // Staff already assigned to this shift
  const assignedIds = new Set(
    assignments.filter(a => a.shift_instance_id === shiftInstanceId).map(a => a.staff_id)
  )

  // Per-staff violation preview: would assigning this person cause any violations?
  // We check existing violations for them on this shift instance.
  const violationsByStaff = new Map<string, string[]>()
  for (const v of violations) {
    if (v.shiftInstanceId === shiftInstanceId && v.staffId) {
      if (!violationsByStaff.has(v.staffId)) violationsByStaff.set(v.staffId, [])
      violationsByStaff.get(v.staffId)!.push(v.message)
    }
  }

  async function handleAssign(staffId: string) {
    setLoading(staffId)
    try {
      await onAssign(staffId)
      setOpen(false)
    } finally {
      setLoading(null)
    }
  }

  const d = new Date(shiftDate + 'T00:00:00Z')
  const dateLabel = `${d.getUTCDate()}/${d.getUTCMonth() + 1}`

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            className="inline-flex items-center gap-0.5 rounded border border-dashed border-gray-300 px-1 py-px text-gray-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-colors leading-tight"
            title={`Assign staff to ${areaName} ${SHIFT_LABEL[shiftType]} on ${dateLabel}`}
          >
            <UserPlus className="h-2.5 w-2.5" />
            <span className="font-medium">{SHIFT_LABEL[shiftType]}</span>
          </button>
        }
      />
      <PopoverContent className="w-56 p-0" side="bottom" align="start">
        <div className="px-3 py-2 border-b border-gray-100">
          <div className="text-xs font-semibold text-gray-700">
            Assign — {areaName} {SHIFT_LABEL[shiftType]}
          </div>
          <div className="text-[10px] text-gray-400">{dateLabel}</div>
        </div>

        {staff.length === 0 ? (
          <div className="px-3 py-3 text-xs text-gray-400">No active staff</div>
        ) : (
          <ul className="max-h-60 overflow-y-auto py-1">
            {staff.map(member => {
              const isAssigned = assignedIds.has(member.id)
              const memberViolations = violationsByStaff.get(member.id) ?? []
              const isLoading = loading === member.id

              return (
                <li key={member.id}>
                  <button
                    disabled={isAssigned || isLoading}
                    onClick={() => handleAssign(member.id)}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 transition-colors',
                      isAssigned
                        ? 'text-gray-400 cursor-default'
                        : 'hover:bg-gray-50 text-gray-700 cursor-pointer',
                    )}
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {memberViolations.length > 0 && !isAssigned && (
                        <span title={memberViolations.join('\n')}>
                          <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                        </span>
                      )}
                      <span className="truncate">{member.full_name}</span>
                      <span className="text-gray-400 shrink-0">{(member.fte_target * 100).toFixed(0)}%</span>
                    </span>
                    {isAssigned && <Check className="h-3 w-3 text-green-500 shrink-0" />}
                    {isLoading && <span className="text-[10px] text-gray-400 shrink-0">…</span>}
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
