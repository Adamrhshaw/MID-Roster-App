'use client'

import { useState } from 'react'
import { Minus, Plus, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Area, ShiftTemplate, ShiftType } from '@/types/database'

interface Props {
  initialTemplates: ShiftTemplate[]
  areas: Area[]
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const SHIFT_TYPES: ShiftType[] = ['morning', 'afternoon', 'night']
const SHIFT_LABELS: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' }
const SHIFT_STYLES: Record<string, React.CSSProperties> = {
  morning:   { background: 'var(--amber-accent-bg)', color: 'var(--amber-accent)' },
  afternoon: { background: 'var(--blue-accent-bg)', color: 'var(--blue-accent)' },
  night:     { background: 'var(--violet-accent-bg)', color: 'var(--violet-accent)' },
}

type CellKey = `${string}:${ShiftType}:${number}` // area_id:shift_type:day_of_week

function cellKey(areaId: string, shiftType: ShiftType, day: number): CellKey {
  return `${areaId}:${shiftType}:${day}`
}

export default function TemplateGrid({ initialTemplates, areas }: Props) {
  const [templates, setTemplates] = useState<ShiftTemplate[]>(initialTemplates)
  const [pending, setPending] = useState<Record<string, number>>({})
  const [hoveredCell, setHoveredCell] = useState<CellKey | null>(null)
  const [saving, setSaving] = useState(false)

  const templateMap = new Map<CellKey, ShiftTemplate>()
  for (const t of templates) {
    templateMap.set(cellKey(t.area_id, t.shift_type as ShiftType, t.day_of_week), t)
  }

  function getDisplayValue(key: CellKey): number {
    if (key in pending) return pending[key]
    return templateMap.get(key)?.required_staff ?? 0
  }

  function adjust(key: CellKey, delta: number) {
    const next = Math.max(0, getDisplayValue(key) + delta)
    const original = templateMap.get(key)?.required_staff ?? 0
    if (next === original) {
      setPending(p => { const cp = { ...p }; delete cp[key]; return cp })
    } else {
      setPending(p => ({ ...p, [key]: next }))
    }
  }

  const pendingKeys = Object.keys(pending)
  const hasPending = pendingKeys.length > 0

  async function saveAll() {
    setSaving(true)
    const updatedTemplates = [...templates]

    for (const [key, val] of Object.entries(pending)) {
      const [areaId, shiftType, dayStr] = key.split(':') as [string, ShiftType, string]
      const day = parseInt(dayStr, 10)
      const existing = templateMap.get(key as CellKey)

      if (existing) {
        if (val === 0) {
          await fetch(`/api/templates/${existing.id}`, { method: 'DELETE' })
          const idx = updatedTemplates.findIndex(t => t.id === existing.id)
          if (idx !== -1) updatedTemplates.splice(idx, 1)
        } else {
          const res = await fetch(`/api/templates/${existing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ required_staff: val }),
          })
          if (res.ok) {
            const updated: ShiftTemplate = await res.json()
            const idx = updatedTemplates.findIndex(t => t.id === existing.id)
            if (idx !== -1) updatedTemplates[idx] = updated
          }
        }
      } else if (val > 0) {
        const res = await fetch('/api/templates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ area_id: areaId, shift_type: shiftType, day_of_week: day, required_staff: val }),
        })
        if (res.ok) {
          const created: ShiftTemplate = await res.json()
          updatedTemplates.push(created)
        }
      }
    }

    setTemplates(updatedTemplates)
    setPending({})
    setSaving(false)
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr style={{ background: 'var(--surface-1)' }}>
            <th className="w-32 text-left py-2 px-3 text-muted-foreground font-medium border-b">Area</th>
            <th className="w-28 text-left py-2 px-3 text-muted-foreground font-medium border-b">Shift</th>
            {DAYS.map(d => (
              <th key={d} className="text-center py-2 px-2 text-muted-foreground font-medium border-b w-20">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {areas.map((area, areaIdx) => (
            SHIFT_TYPES.map((shiftType, shiftIdx) => {
              const isFirstRow = shiftIdx === 0
              const isLastShift = shiftIdx === SHIFT_TYPES.length - 1
              return (
                <tr
                  key={`${area.id}-${shiftType}`}
                  style={isLastShift && areaIdx < areas.length - 1 ? { borderBottom: '1px solid var(--border)' } : {}}
                >
                  <td className={`py-1.5 px-3 align-middle ${isFirstRow ? 'font-medium' : ''}`}>
                    {isFirstRow ? area.name : ''}
                  </td>
                  <td className="py-1.5 px-3 align-middle">
                    <span className="inline-block rounded px-1.5 py-0.5 text-xs font-medium" style={SHIFT_STYLES[shiftType]}>
                      {SHIFT_LABELS[shiftType]}
                    </span>
                  </td>
                  {Array.from({ length: 7 }, (_, day) => {
                    const key = cellKey(area.id, shiftType, day)
                    const displayValue = getDisplayValue(key)
                    const isDirty = key in pending
                    const isHovered = hoveredCell === key
                    const isWeekend = day >= 5

                    return (
                      <td
                        key={day}
                        className="py-1 px-1 text-center align-middle"
                        style={isWeekend ? { background: 'var(--surface-1)' } : {}}
                        onMouseEnter={() => setHoveredCell(key)}
                        onMouseLeave={() => setHoveredCell(null)}
                      >
                        <div className="flex items-center justify-center gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => adjust(key, -1)}
                            className={`h-6 w-5 transition-opacity ${isHovered && displayValue > 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                            style={{ color: 'var(--text-mute)' }}
                            tabIndex={-1}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span
                            className="text-sm font-medium w-6 text-center select-none"
                            style={{
                              color: isDirty
                                ? 'var(--blue-accent)'
                                : displayValue === 0
                                  ? 'var(--text-mute)'
                                  : 'var(--foreground)',
                              fontWeight: isDirty ? 600 : 500,
                            }}
                          >
                            {displayValue === 0 ? '—' : displayValue}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => adjust(key, +1)}
                            className={`h-6 w-5 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                            style={{ color: 'var(--text-mute)' }}
                            tabIndex={-1}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })
          ))}
        </tbody>
      </table>

      <div className="mt-4 px-3 flex items-center gap-3 min-h-[36px]">
        {hasPending ? (
          <>
            <Button onClick={saveAll} disabled={saving} size="sm">
              {saving
                ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Saving…</>
                : 'Save changes'
              }
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPending({})}
              disabled={saving}
              className="text-muted-foreground"
            >
              Discard
            </Button>
            <span className="text-xs text-muted-foreground">
              {pendingKeys.length} unsaved {pendingKeys.length === 1 ? 'change' : 'changes'}
            </span>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Hover any cell to adjust staff count. Changes highlighted in blue until saved.
            Weekend columns are shaded. Fixed shift times: Morning 08:00–16:00, Afternoon 16:00–00:00, Night 00:00–08:00.
          </p>
        )}
      </div>
    </div>
  )
}
