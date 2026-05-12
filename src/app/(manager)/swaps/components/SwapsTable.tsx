'use client'

import { useState, useTransition } from 'react'
import { MoreHorizontal, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { ShiftSwap, ShiftType } from '@/types/database'

const SHIFT_LABELS: Record<ShiftType, string> = {
  morning: 'AM',
  afternoon: 'PM',
  night: 'NT',
  ado: 'ADO',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

function shiftCell(assignment: ShiftSwap['requester_assignment'] | ShiftSwap['target_assignment']) {
  if (!assignment?.shift_instance) return '—'
  const si = assignment.shift_instance
  const area = si.area?.name ?? ''
  return `${area} · ${SHIFT_LABELS[si.shift_type]} · ${formatDate(si.shift_date)}`
}

interface Props {
  initialSwaps: ShiftSwap[]
}

export default function SwapsTable({ initialSwaps }: Props) {
  const [swaps, setSwaps] = useState<ShiftSwap[]>(initialSwaps)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const pending = swaps.filter(s => s.status === 'pending')
  const approved = swaps.filter(s => s.status === 'approved')
  const rejected = swaps.filter(s => s.status === 'rejected')

  async function refresh() {
    const res = await fetch('/api/swaps')
    if (res.ok) {
      const data = await res.json()
      startTransition(() => setSwaps(data))
    }
  }

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setPendingId(id)
    try {
      const res = await fetch(`/api/swaps/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) {
        refresh()
      }
    } finally {
      setPendingId(null)
    }
  }

  function renderPendingRow(swap: ShiftSwap) {
    const isBusy = pendingId === swap.id
    const hasTarget = !!swap.target_assignment_id

    return (
      <TableRow key={swap.id} className="">
        <TableCell className="font-medium">{swap.requester_staff?.full_name ?? swap.requester_staff_id}</TableCell>
        <TableCell className="text-sm font-mono text-xs">{shiftCell(swap.requester_assignment)}</TableCell>
        <TableCell className="text-muted-foreground">{swap.target_staff?.full_name ?? '—'}</TableCell>
        <TableCell className="text-sm font-mono text-xs">{shiftCell(swap.target_assignment)}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{formatDate(swap.created_at)}</TableCell>
        <TableCell className="text-sm text-muted-foreground max-w-[160px] truncate" title={swap.reason ?? undefined}>
          {swap.reason ?? '—'}
        </TableCell>
        <TableCell>
          <Popover>
            <PopoverTrigger
              render={<Button variant="ghost" size="icon-sm" className="h-7 w-7" disabled={isBusy} />}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Actions</span>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1">
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ color: 'var(--green-accent)' }}
                onMouseEnter={e => { if (!isBusy && hasTarget) e.currentTarget.style.background = 'var(--green-accent-bg)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                disabled={isBusy || !hasTarget}
                title={!hasTarget ? 'No swap partner assigned' : undefined}
                onClick={() => handleAction(swap.id, 'approve')}
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Approve
              </button>
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors disabled:opacity-50"
                style={{ color: 'var(--red-accent)' }}
                onMouseEnter={e => { if (!isBusy) e.currentTarget.style.background = 'var(--red-accent-bg)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                disabled={isBusy}
                onClick={() => handleAction(swap.id, 'reject')}
              >
                <XCircle className="h-3.5 w-3.5" />
                Reject
              </button>
            </PopoverContent>
          </Popover>
        </TableCell>
      </TableRow>
    )
  }

  function renderReadOnlyRow(swap: ShiftSwap) {
    return (
      <TableRow key={swap.id} className="">
        <TableCell className="font-medium">{swap.requester_staff?.full_name ?? swap.requester_staff_id}</TableCell>
        <TableCell className="text-sm font-mono text-xs">{shiftCell(swap.requester_assignment)}</TableCell>
        <TableCell className="text-muted-foreground">{swap.target_staff?.full_name ?? '—'}</TableCell>
        <TableCell className="text-sm font-mono text-xs">{shiftCell(swap.target_assignment)}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{formatDate(swap.created_at)}</TableCell>
      </TableRow>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Shift Swaps</h1>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {pending.length > 0 && (
              <span className="ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium" style={{ background: 'var(--amber-accent-bg)', color: 'var(--amber-accent)' }}>
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: 'var(--surface-1)' }}>
                  <TableHead>Requester</TableHead>
                  <TableHead>Their Shift</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Partner&apos;s Shift</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-sm" style={{ color: 'var(--text-mute)' }}>
                      No pending swap requests.
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map(s => renderPendingRow(s))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: 'var(--surface-1)' }}>
                  <TableHead>Requester</TableHead>
                  <TableHead>Their Shift</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Partner&apos;s Shift</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approved.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--text-mute)' }}>
                      No approved swaps.
                    </TableCell>
                  </TableRow>
                ) : (
                  approved.map(s => renderReadOnlyRow(s))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <Table>
              <TableHeader>
                <TableRow style={{ background: 'var(--surface-1)' }}>
                  <TableHead>Requester</TableHead>
                  <TableHead>Their Shift</TableHead>
                  <TableHead>Partner</TableHead>
                  <TableHead>Partner&apos;s Shift</TableHead>
                  <TableHead>Submitted</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rejected.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-10 text-sm" style={{ color: 'var(--text-mute)' }}>
                      No rejected swaps.
                    </TableCell>
                  </TableRow>
                ) : (
                  rejected.map(s => renderReadOnlyRow(s))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
