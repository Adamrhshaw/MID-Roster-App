'use client'

import { useState, useTransition } from 'react'
import { MoreHorizontal, CheckCircle, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { LeaveRequest, LeaveType } from '@/types/database'

const LEAVE_LABELS: Record<LeaveType, string> = {
  annual: 'Annual Leave',
  sick: 'Sick Leave',
  study: 'Study Leave',
  ado: 'ADO',
  rdo: 'RDO',
  long_service: 'Long Service',
  parental: 'Parental Leave',
  bereavement: 'Bereavement',
  military: 'Military',
  other: 'Other',
}

function leaveTypeBadgeClass(type: LeaveType): string {
  switch (type) {
    case 'annual': return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'sick': return 'bg-red-50 text-red-700 border-red-200'
    case 'ado':
    case 'rdo': return 'bg-green-50 text-green-700 border-green-200'
    default: return ''
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
}

interface Props {
  initialRequests: LeaveRequest[]
}

export default function LeaveTable({ initialRequests }: Props) {
  const [requests, setRequests] = useState<LeaveRequest[]>(initialRequests)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [, startTransition] = useTransition()

  const pending = requests.filter(r => r.status === 'pending')
  const approved = requests.filter(r => r.status === 'approved')
  const rejected = requests.filter(r => r.status === 'rejected')

  async function refresh() {
    const res = await fetch('/api/leave')
    if (res.ok) {
      const data = await res.json()
      startTransition(() => setRequests(data))
    }
  }

  async function handleAction(id: string, action: 'approve' | 'reject') {
    setPendingId(id)
    try {
      const res = await fetch(`/api/leave/${id}`, {
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

  function renderLeaveType(type: LeaveType) {
    const cls = leaveTypeBadgeClass(type)
    return (
      <Badge variant="outline" className={`text-xs ${cls}`}>
        {LEAVE_LABELS[type]}
      </Badge>
    )
  }

  function renderRow(req: LeaveRequest, showActions: boolean) {
    const notes = req.notes ?? null
    const notesDisplay = notes
      ? notes.length > 40 ? notes.slice(0, 40) + '…' : notes
      : '—'
    const isBusy = pendingId === req.id

    return (
      <TableRow key={req.id} className="hover:bg-gray-50/50">
        <TableCell className="font-medium">{req.staff?.full_name ?? req.staff_id}</TableCell>
        <TableCell>{renderLeaveType(req.leave_type)}</TableCell>
        <TableCell className="text-sm">{formatDate(req.start_date)}</TableCell>
        <TableCell className="text-sm">{formatDate(req.end_date)}</TableCell>
        <TableCell className="text-sm text-muted-foreground">{formatDate(req.created_at)}</TableCell>
        <TableCell className="text-sm text-muted-foreground max-w-[180px] truncate" title={notes ?? undefined}>
          {notesDisplay}
        </TableCell>
        {showActions && (
          <TableCell>
            <Popover>
              <PopoverTrigger
                render={<Button variant="ghost" size="icon-sm" className="h-7 w-7" disabled={isBusy} />}
              >
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Actions</span>
              </PopoverTrigger>
              <PopoverContent className="w-40 p-1">
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-green-700 hover:bg-green-50 disabled:opacity-50"
                  disabled={isBusy}
                  onClick={() => handleAction(req.id, 'approve')}
                >
                  <CheckCircle className="h-3.5 w-3.5" />
                  Approve
                </button>
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  disabled={isBusy}
                  onClick={() => handleAction(req.id, 'reject')}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </button>
              </PopoverContent>
            </Popover>
          </TableCell>
        )}
      </TableRow>
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold">Leave Requests</h1>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending
            {pending.length > 0 && (
              <span className="ml-1.5 rounded-full bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Rejected</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Staff</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pending.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-10 text-sm text-gray-400">
                      No pending leave requests.
                    </TableCell>
                  </TableRow>
                ) : (
                  pending.map(r => renderRow(r, true))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="approved" className="mt-4">
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Staff</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {approved.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-sm text-gray-400">
                      No approved leave.
                    </TableCell>
                  </TableRow>
                ) : (
                  approved.map(r => renderRow(r, false))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead>Staff</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rejected.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-10 text-sm text-gray-400">
                      No rejected leave.
                    </TableCell>
                  </TableRow>
                ) : (
                  rejected.map(r => renderRow(r, false))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
