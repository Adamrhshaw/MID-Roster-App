'use client'

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import StaffForm, { staffToFormValues, type StaffFormValues } from './StaffForm'
import type { Area, Certification, Staff } from '@/types/database'

interface Props {
  staff: Staff | null
  areas: Area[]
  certifications: Certification[]
  onClose: () => void
  onUpdated: () => void
}

export default function EditStaffSheet({ staff, areas, certifications, onClose, onUpdated }: Props) {
  if (!staff) return null

  async function handleSubmit(values: StaffFormValues) {
    const res = await fetch(`/api/staff/${staff!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...values,
        fte_target: parseFloat(values.fte_target),
      }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? 'Failed to update staff member')
    }
    onClose()
    onUpdated()
  }

  return (
    <Sheet open={!!staff} onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Edit {staff.full_name}</SheetTitle>
        </SheetHeader>
        <div className="px-4 pb-4">
          <StaffForm
            areas={areas}
            certifications={certifications}
            initial={staffToFormValues(staff)}
            onSubmit={handleSubmit}
            onCancel={onClose}
            submitLabel="Save changes"
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
