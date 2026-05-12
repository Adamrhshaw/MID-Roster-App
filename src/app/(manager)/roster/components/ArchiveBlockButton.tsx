'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog'

interface Props {
  blockId: string
  blockLabel: string
}

export default function ArchiveBlockButton({ blockId, blockLabel }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleArchive() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/roster/${blockId}/archive`, { method: 'POST' })
      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        setError(json.error ?? 'Failed to archive block')
        setBusy(false)
        return
      }
      setOpen(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5" />
        }
      >
        <Archive className="h-3.5 w-3.5" />
        Archive
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Archive this block?</DialogTitle>
          <DialogDescription>
            <strong>{blockLabel}</strong> will be removed from the public roster view and the block switcher will show it as archived. Assignments are preserved.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm" style={{ color: 'var(--red-accent)' }}>{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={busy} />}>
            Cancel
          </DialogClose>
          <Button onClick={handleArchive} disabled={busy}>
            {busy ? 'Archiving…' : 'Archive block'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
