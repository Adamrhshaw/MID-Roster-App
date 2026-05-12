'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
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

export default function DeleteRosterBlockButton({ blockId, blockLabel }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    const res = await fetch(`/api/roster/${blockId}`, { method: 'DELETE' })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      setError(json.error ?? 'Failed to delete block')
      setLoading(false)
      return
    }
    setOpen(false)
    router.push('/roster')
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5" style={{ color: 'var(--red-accent)', borderColor: 'var(--red-accent-border)' }} />
        }
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Delete draft block?</DialogTitle>
          <DialogDescription>
            <strong>{blockLabel}</strong> and all its shift instances will be permanently deleted.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        {error && <p className="text-sm" style={{ color: 'var(--red-accent)' }}>{error}</p>}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" disabled={loading} />}>
            Cancel
          </DialogClose>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Deleting…' : 'Delete block'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
