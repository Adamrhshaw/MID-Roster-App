'use client'

import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import StaffForm from './StaffForm'
import type { Area } from '@/types/database'

interface Props {
  areas: Area[]
  onCreated: () => void
}

export default function AddStaffDialog({ areas, onCreated }: Props) {
  const [open, setOpen] = useState(false)

  async function handleSubmit(values: import('./StaffForm').StaffFormValues) {
    const res = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        fte_target: parseFloat(values.fte_target),
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? 'Failed to create staff member')
    }
    setOpen(false)
    onCreated()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-1.5" />}>
        <UserPlus className="h-4 w-4" />
        Add Staff
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add staff member</DialogTitle>
        </DialogHeader>
        <StaffForm
          areas={areas}
          onSubmit={handleSubmit}
          onCancel={() => setOpen(false)}
          submitLabel="Add staff"
        />
      </DialogContent>
    </Dialog>
  )
}
