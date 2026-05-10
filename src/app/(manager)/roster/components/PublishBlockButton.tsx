'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface CoverageGap {
  shiftInstanceId: string
  areaName: string
  date: string
  shiftType: string
  required: number
  filled: number
}

interface Props {
  blockId: string
}

export default function PublishBlockButton({ blockId }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [gaps, setGaps] = useState<CoverageGap[]>([])
  const [error, setError] = useState<string | null>(null)

  async function publish(force: boolean) {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(
        `/api/roster/${blockId}/publish${force ? '?force=true' : ''}`,
        { method: 'POST' }
      )
      const data = await res.json()
      if (res.ok) {
        setOpen(false)
        setGaps([])
        router.refresh()
        return
      }
      if (res.status === 409 && Array.isArray(data.gaps)) {
        setGaps(data.gaps as CoverageGap[])
        setOpen(true)
        return
      }
      setError(data.error ?? 'Failed to publish')
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
      setOpen(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        className="gap-1.5"
        onClick={() => publish(false)}
        disabled={busy}
      >
        <Send className="h-3.5 w-3.5" />
        {busy && gaps.length === 0 ? 'Publishing…' : 'Publish'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {error ? 'Publish failed' : 'Publish with coverage gaps?'}
            </DialogTitle>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!error && gaps.length > 0 && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-gray-700">
                {gaps.length} shift{gaps.length === 1 ? '' : 's'} {gaps.length === 1 ? 'is' : 'are'} still under-filled.
                You can publish anyway, or cancel to keep filling them.
              </p>
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                <ul className="flex max-h-48 flex-col gap-1 overflow-y-auto text-xs text-amber-900">
                  {gaps.map(g => (
                    <li key={g.shiftInstanceId}>
                      {g.date} · {g.areaName} · {g.shiftType.toUpperCase()} ({g.filled}/{g.required})
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            {!error && gaps.length > 0 && (
              <Button onClick={() => publish(true)} disabled={busy}>
                {busy ? 'Publishing…' : 'Publish anyway'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
