'use client'

import { useState } from 'react'
import { Wand2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRosterStore } from '@/lib/warnings/rosterStore'

interface UnresolvableGap {
  shiftInstanceId: string
  areaName: string
  date: string
  shiftType: string
  required: number
  filled: number
}

interface GenerationReport {
  filledCount: number
  unresolvableGaps: UnresolvableGap[]
  preservedManualAssignments: number
  cancelledByLeave: number
  adoScheduled: number
  adoDeferred: number
}

interface Props {
  blockId: string
}

export default function GenerateDraftButton({ blockId }: Props) {
  const hydrate = useRosterStore(s => s.hydrate)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState<GenerationReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/roster/${blockId}/generate`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Generation failed')
        setOpen(true)
        return
      }
      setReport(data as GenerationReport)
      setOpen(true)

      // Refresh the grid: re-fetch and re-hydrate the roster store.
      const refresh = await fetch(`/api/roster/${blockId}/shifts`)
      if (refresh.ok) {
        const json = await refresh.json()
        hydrate({
          blockId,
          blockStart: json.block.start_date,
          blockEnd: json.block.end_date,
          staff: json.staff,
          shifts: json.shifts,
          areas: json.areas,
          staffAreas: json.staffAreas,
          assignments: json.assignments,
          leaveRequests: json.leaveRequests,
          availability: json.availability,
        })
      }
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
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={handleGenerate}
        disabled={busy}
      >
        <Wand2 className="h-3.5 w-3.5" />
        {busy ? 'Generating…' : 'Generate Draft'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{error ? 'Generation failed' : 'Draft generated'}</DialogTitle>
          </DialogHeader>
          {error && <p className="pt-2 text-sm" style={{ color: 'var(--red-accent)' }}>{error}</p>}
          {report && (
            <div className="flex flex-col gap-3 pt-2 text-sm">
              <ReportRow label="Shifts filled" value={report.filledCount} />
              <ReportRow label="Manual assignments preserved" value={report.preservedManualAssignments} />
              <ReportRow label="Cancelled by approved leave" value={report.cancelledByLeave} />
              <ReportRow label="ADO days scheduled" value={report.adoScheduled} />
              <ReportRow label="ADO days deferred (carry-forward)" value={report.adoDeferred} />
              <ReportRow
                label="Unresolvable gaps"
                value={report.unresolvableGaps.length}
                emphasis={report.unresolvableGaps.length > 0}
              />
              {report.unresolvableGaps.length > 0 && (
                <div className="mt-2 rounded-md p-3" style={{ border: '1px solid var(--amber-accent-border)', background: 'var(--amber-accent-bg)' }}>
                  <p className="text-xs font-medium" style={{ color: 'var(--amber-accent)' }}>
                    These shifts could not be filled — assign manually:
                  </p>
                  <ul className="mt-2 flex max-h-48 flex-col gap-1 overflow-y-auto text-xs" style={{ color: 'var(--amber-accent)' }}>
                    {report.unresolvableGaps.map(g => (
                      <li key={g.shiftInstanceId}>
                        {g.date} · {g.areaName} · {g.shiftType.toUpperCase()} ({g.filled}/{g.required})
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="flex justify-end pt-3">
            <Button size="sm" onClick={() => setOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ReportRow({ label, value, emphasis }: { label: string; value: number; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span className="font-medium" style={{ color: emphasis ? 'var(--amber-accent)' : 'var(--foreground)' }}>
        {value}
      </span>
    </div>
  )
}
