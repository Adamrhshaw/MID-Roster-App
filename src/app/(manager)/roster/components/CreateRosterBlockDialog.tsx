'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { RosterBlock } from '@/types/database'

interface Props {
  /** If provided, render as a button with this label. Otherwise render as a full-width trigger. */
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline' | 'ghost'
  triggerSize?: 'default' | 'sm'
}

/** Returns YYYY-MM-DD for today + offsetDays */
function dateOffset(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export default function CreateRosterBlockDialog({
  triggerLabel = 'New Block',
  triggerVariant = 'default',
  triggerSize = 'sm',
}: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState(dateOffset(1))
  const [endDate, setEndDate] = useState(dateOffset(28))
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (new Date(endDate) <= new Date(startDate)) {
      setError('End date must be after start date.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/roster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || undefined, start_date: startDate, end_date: endDate }),
      })
      const data: RosterBlock & { error?: string } = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create block')
        return
      }
      setOpen(false)
      router.push(`/roster/${data.id}`)
      router.refresh()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant={triggerVariant} size={triggerSize} className="gap-1.5" />}>
        <CalendarPlus className="h-4 w-4" />
        {triggerLabel}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Create roster block</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-name">Name (optional)</Label>
            <Input
              id="block-name"
              placeholder="e.g. Block 3 — May 2026"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="block-start">Start date</Label>
              <Input
                id="block-start"
                type="date"
                required
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="block-end">End date</Label>
              <Input
                id="block-end"
                type="date"
                required
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create block'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
