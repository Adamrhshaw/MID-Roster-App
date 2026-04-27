'use client'

import { useState, useTransition } from 'react'
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Area } from '@/types/database'

interface Props {
  initialAreas: Area[]
}

interface EditState {
  name: string
  min_staff_per_shift: string
}

export default function AreasManager({ initialAreas }: Props) {
  const [areas, setAreas] = useState<Area[]>(initialAreas)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>({ name: '', min_staff_per_shift: '' })
  const [adding, setAdding] = useState(false)
  const [newState, setNewState] = useState<EditState>({ name: '', min_staff_per_shift: '1' })
  const [, startTransition] = useTransition()

  async function refresh() {
    const res = await fetch('/api/areas')
    if (res.ok) {
      const data = await res.json()
      startTransition(() => setAreas(data))
    }
  }

  function startEdit(area: Area) {
    setEditingId(area.id)
    setEditState({ name: area.name, min_staff_per_shift: String(area.min_staff_per_shift) })
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    const min = parseInt(editState.min_staff_per_shift, 10)
    if (!editState.name.trim() || isNaN(min) || min < 1) return

    const res = await fetch(`/api/areas/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editState.name.trim(), min_staff_per_shift: min }),
    })
    if (res.ok) {
      setEditingId(null)
      refresh()
    }
  }

  async function deleteArea(id: string) {
    if (!confirm('Delete this area? This cannot be undone if staff or templates reference it.')) return
    const res = await fetch(`/api/areas/${id}`, { method: 'DELETE' })
    if (res.ok) refresh()
  }

  async function saveNew() {
    const min = parseInt(newState.min_staff_per_shift, 10)
    if (!newState.name.trim() || isNaN(min) || min < 1) return

    const res = await fetch('/api/areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newState.name.trim(), min_staff_per_shift: min }),
    })
    if (res.ok) {
      setAdding(false)
      setNewState({ name: '', min_staff_per_shift: '1' })
      refresh()
    }
  }

  function cancelNew() {
    setAdding(false)
    setNewState({ name: '', min_staff_per_shift: '1' })
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Areas</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Modality areas and their minimum staffing levels per shift.</p>
        </div>
        {!adding && (
          <Button size="sm" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Add Area
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gray-50">
              <TableHead>Name</TableHead>
              <TableHead className="w-48">Min staff per shift</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.length === 0 && !adding ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-10 text-sm text-gray-400">
                  No areas yet — click Add Area to get started.
                </TableCell>
              </TableRow>
            ) : (
              areas.map(area => (
                <TableRow key={area.id}>
                  <TableCell>
                    {editingId === area.id ? (
                      <Input
                        value={editState.name}
                        onChange={e => setEditState(s => ({ ...s, name: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(area.id); if (e.key === 'Escape') cancelEdit() }}
                        className="h-8"
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium">{area.name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {editingId === area.id ? (
                      <Input
                        type="number"
                        min={1}
                        value={editState.min_staff_per_shift}
                        onChange={e => setEditState(s => ({ ...s, min_staff_per_shift: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') saveEdit(area.id); if (e.key === 'Escape') cancelEdit() }}
                        className="h-8 w-24"
                      />
                    ) : (
                      <span className="text-muted-foreground">{area.min_staff_per_shift}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      {editingId === area.id ? (
                        <>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={() => saveEdit(area.id)}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={cancelEdit}>
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={() => startEdit(area)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => deleteArea(area.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}

            {adding && (
              <TableRow className="bg-blue-50/50">
                <TableCell>
                  <Input
                    placeholder="e.g. X-Ray"
                    value={newState.name}
                    onChange={e => setNewState(s => ({ ...s, name: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') cancelNew() }}
                    className="h-8"
                    autoFocus
                  />
                </TableCell>
                <TableCell>
                  <Input
                    type="number"
                    min={1}
                    value={newState.min_staff_per_shift}
                    onChange={e => setNewState(s => ({ ...s, min_staff_per_shift: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveNew(); if (e.key === 'Escape') cancelNew() }}
                    className="h-8 w-24"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1 justify-end">
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" onClick={saveNew}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="h-7 w-7" onClick={cancelNew}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
