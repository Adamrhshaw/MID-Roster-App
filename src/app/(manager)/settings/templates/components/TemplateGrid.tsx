'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { Area, ShiftTemplate, ShiftType } from '@/types/database'

interface Props {
  initialTemplates: ShiftTemplate[]
  areas: Area[]
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const SHIFT_TYPES: ShiftType[] = ['morning', 'afternoon', 'night']
const SHIFT_LABELS: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', night: 'Night' }
const SHIFT_COLORS: Record<string, string> = {
  morning:   'bg-amber-50 text-amber-700',
  afternoon: 'bg-blue-50 text-blue-700',
  night:     'bg-slate-100 text-slate-600',
}

type CellKey = `${string}:${ShiftType}:${number}` // area_id:shift_type:day_of_week

function cellKey(areaId: string, shiftType: ShiftType, day: number): CellKey {
  return `${areaId}:${shiftType}:${day}`
}

export default function TemplateGrid({ initialTemplates, areas }: Props) {
  const [templates, setTemplates] = useState<ShiftTemplate[]>(initialTemplates)
  // cellKey → template id (or null if not yet created)
  const templateMap = new Map<CellKey, ShiftTemplate>()
  for (const t of templates) {
    templateMap.set(cellKey(t.area_id, t.shift_type as ShiftType, t.day_of_week), t)
  }

  const [editingCell, setEditingCell] = useState<CellKey | null>(null)
  const [editValue, setEditValue] = useState('')
  function startEdit(key: CellKey, current: number) {
    setEditingCell(key)
    setEditValue(String(current))
  }

  function cancelEdit() {
    setEditingCell(null)
    setEditValue('')
  }

  async function commitEdit(key: CellKey) {
    const val = parseInt(editValue, 10)
    if (isNaN(val) || val < 0) { cancelEdit(); return }

    const [areaId, shiftType, dayStr] = key.split(':') as [string, ShiftType, string]
    const day = parseInt(dayStr, 10)
    const existing = templateMap.get(key)

    let updated: ShiftTemplate | null = null

    if (existing) {
      if (val === existing.required_staff) { cancelEdit(); return }
      if (val === 0) {
        // Delete — no shift on this day
        await fetch(`/api/templates/${existing.id}`, { method: 'DELETE' })
        setTemplates(ts => ts.filter(t => t.id !== existing.id))
      } else {
        const res = await fetch(`/api/templates/${existing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ required_staff: val }),
        })
        if (res.ok) updated = await res.json()
        if (updated) setTemplates(ts => ts.map(t => t.id === existing.id ? updated! : t))
      }
    } else if (val > 0) {
      // Create new template for this cell
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area_id: areaId, shift_type: shiftType, day_of_week: day, required_staff: val }),
      })
      if (res.ok) {
        updated = await res.json()
        if (updated) setTemplates(ts => [...ts, updated!])
      }
    }

    cancelEdit()
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-32 text-left py-2 px-3 text-muted-foreground font-medium border-b">Area</th>
            <th className="w-28 text-left py-2 px-3 text-muted-foreground font-medium border-b">Shift</th>
            {DAYS.map(d => (
              <th key={d} className="text-center py-2 px-2 text-muted-foreground font-medium border-b w-16">{d}</th>
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
                  className={isLastShift && areaIdx < areas.length - 1 ? 'border-b border-gray-200' : ''}
                >
                  {/* Area name cell — rowspan via hidden cells */}
                  <td className={`py-1.5 px-3 align-middle ${isFirstRow ? 'font-medium' : ''}`}>
                    {isFirstRow ? area.name : ''}
                  </td>
                  <td className="py-1.5 px-3 align-middle">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${SHIFT_COLORS[shiftType]}`}>
                      {SHIFT_LABELS[shiftType]}
                    </span>
                  </td>
                  {Array.from({ length: 7 }, (_, day) => {
                    const key = cellKey(area.id, shiftType, day)
                    const tmpl = templateMap.get(key)
                    const count = tmpl?.required_staff ?? 0
                    const isEditing = editingCell === key
                    const isWeekend = day >= 5

                    return (
                      <td
                        key={day}
                        className={`py-1 px-1 text-center align-middle ${isWeekend ? 'bg-gray-50/60' : ''}`}
                      >
                        {isEditing ? (
                          <div className="flex items-center gap-0.5 justify-center">
                            <Input
                              autoFocus
                              type="number"
                              min={0}
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitEdit(key)
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              className="h-7 w-12 text-center px-1"
                            />
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-6 w-6 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 shrink-0"
                              onClick={() => commitEdit(key)}
                            >
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="h-6 w-6 shrink-0"
                              onClick={cancelEdit}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => startEdit(key, count)}
                            className={`w-10 h-8 text-sm font-medium ${
                              count === 0
                                ? 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
                                : 'text-gray-800 hover:bg-blue-50 hover:text-blue-700'
                            }`}
                            title={count === 0 ? 'No shift — click to add' : `${count} staff required — click to edit`}
                          >
                            {count === 0 ? '—' : count}
                          </Button>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })
          ))}
        </tbody>
      </table>

      <p className="mt-4 mb-3 px-3 text-xs text-muted-foreground">
        Click any cell to edit. Enter staff count (0 to remove that shift from the template).
        Weekend columns are shaded. Fixed shift times: Morning 08:00–16:00, Afternoon 16:00–00:00, Night 00:00–08:00.
      </p>
    </div>
  )
}
