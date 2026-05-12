'use client'

import { AlertTriangle } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRosterStore } from '@/lib/warnings/rosterStore'
import { useState } from 'react'

interface Props {
  onJumpToWeek: (weekOffset: number) => void
  blockStart: string
}

export default function ViolationsPopover({ onJumpToWeek, blockStart }: Props) {
  const violations = useRosterStore(s => s.violations)
  const staff = useRosterStore(s => s.staff)
  const shifts = useRosterStore(s => s.shifts)
  const highlightCell = useRosterStore(s => s.highlightCell)
  const [open, setOpen] = useState(false)

  if (violations.length === 0) return null

  const staffById = new Map(staff.map(s => [s.id, s]))

  function weekOffsetForShift(shiftInstanceId: string): number {
    const shift = shifts.find(s => s.id === shiftInstanceId)
    if (!shift) return 0
    const blockStartMs = new Date(blockStart + 'T00:00:00Z').getTime()
    const shiftMs = new Date(shift.shift_date + 'T00:00:00Z').getTime()
    const dayOffset = Math.floor((shiftMs - blockStartMs) / (1000 * 60 * 60 * 24))
    return Math.max(0, Math.floor(dayOffset / 7))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            className="relative flex items-center justify-center h-7 w-7 rounded transition-colors"
            style={{ color: 'var(--amber-accent)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            <AlertTriangle className="h-4 w-4" />
            <span
              className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold leading-none"
              style={{ background: 'var(--amber-accent)', color: '#0a0a0a' }}
            >
              {violations.length > 99 ? '!' : violations.length}
            </span>
          </button>
        }
      />
      <PopoverContent className="w-80 p-0" align="end">
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <span className="text-xs font-semibold" style={{ color: 'var(--foreground)' }}>
            Warnings ({violations.length})
          </span>
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {violations.map((v, i) => {
            const staffMember = v.staffId ? staffById.get(v.staffId) : null
            const weekOffset = v.shiftInstanceId ? weekOffsetForShift(v.shiftInstanceId) : null
            return (
              <li key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <button
                  className="w-full text-left px-3 py-2 transition-colors"
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                  onClick={() => {
                    if (weekOffset !== null) onJumpToWeek(weekOffset)
                    if (v.shiftInstanceId && v.staffId) highlightCell(v.shiftInstanceId, v.staffId)
                    setOpen(false)
                  }}
                >
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" style={{ color: 'var(--amber-accent)' }} />
                    <div className="min-w-0">
                      {staffMember && (
                        <div className="text-[10px] font-medium truncate" style={{ color: 'var(--text-mute)' }}>
                          {staffMember.full_name}
                        </div>
                      )}
                      <div className="text-xs" style={{ color: 'var(--foreground)' }}>
                        <span className="font-medium">{v.name}:</span> {v.message}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
