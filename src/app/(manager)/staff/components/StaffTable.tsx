'use client'

import { useState, useTransition } from 'react'
import { Pencil, MoreHorizontal, UserMinus, UserCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import AddStaffDialog from './AddStaffDialog'
import EditStaffSheet from './EditStaffSheet'
import type { Area, Staff } from '@/types/database'
import { Search } from 'lucide-react'

interface Props {
  initialStaff: Staff[]
  areas: Area[]
}

export default function StaffTable({ initialStaff, areas }: Props) {
  const [staff, setStaff] = useState<Staff[]>(initialStaff)
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<Staff | null>(null)
  const [, startTransition] = useTransition()

  async function refresh() {
    const res = await fetch('/api/staff')
    if (res.ok) {
      const data = await res.json()
      const mapped = data.map((s: Staff & { staff_areas?: { area: { id: string; name: string } }[] }) => ({
        ...s,
        areas: s.staff_areas?.map(sa => sa.area).filter(Boolean) ?? [],
      }))
      startTransition(() => setStaff(mapped))
    }
  }

  async function deactivate(id: string) {
    const res = await fetch(`/api/staff/${id}`, { method: 'DELETE' })
    if (res.ok) refresh()
  }

  async function reactivate(id: string) {
    const res = await fetch(`/api/staff/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: true }),
    })
    if (res.ok) refresh()
  }

  const filtered = staff.filter(s => {
    if (!query) return true
    const q = query.toLowerCase()
    return (
      s.full_name.toLowerCase().includes(q) ||
      s.employee_id.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Staff</h1>
        <AddStaffDialog areas={areas} onCreated={refresh} />
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-mute)' }} />
          <Input
            placeholder="Search staff…"
            className="pl-9"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">{filtered.length} of {staff.length}</span>
      </div>

      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <Table>
          <TableHeader>
            <TableRow style={{ background: 'var(--surface-1)' }}>
              <TableHead>Name</TableHead>
              <TableHead>Employee ID</TableHead>
              <TableHead>FTE</TableHead>
              <TableHead>Areas</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-sm" style={{ color: 'var(--text-mute)' }}>
                  {query ? 'No staff match your search.' : 'No staff yet — click Add Staff to get started.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(member => (
                <TableRow key={member.id}>
                  <TableCell className="font-medium">{member.full_name}</TableCell>
                  <TableCell className="text-muted-foreground font-mono text-xs">{member.employee_id}</TableCell>
                  <TableCell>{(member.fte_target * 100).toFixed(0)}%</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {member.areas && member.areas.length > 0 ? (
                        member.areas.map(a => (
                          <Badge key={a.id} variant="secondary" className="text-xs">
                            {a.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={member.is_active ? 'default' : 'secondary'} className="text-xs">
                      {member.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Popover>
                      <PopoverTrigger
                        render={<Button variant="ghost" size="icon-sm" className="h-7 w-7" />}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </PopoverTrigger>
                      <PopoverContent className="w-40 p-1">
                        <button
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                          onClick={() => setEditing(member)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        {member.is_active ? (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
                            style={{ color: 'var(--red-accent)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--red-accent-bg)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                            onClick={() => deactivate(member.id)}
                          >
                            <UserMinus className="h-3.5 w-3.5" />
                            Deactivate
                          </button>
                        ) : (
                          <button
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors"
                            style={{ color: 'var(--green-accent)' }}
                            onMouseEnter={e => { e.currentTarget.style.background = 'var(--green-accent-bg)' }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                            onClick={() => reactivate(member.id)}
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            Reactivate
                          </button>
                        )}
                      </PopoverContent>
                    </Popover>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <EditStaffSheet
        staff={editing}
        areas={areas}
        onClose={() => setEditing(null)}
        onUpdated={refresh}
      />
    </div>
  )
}
