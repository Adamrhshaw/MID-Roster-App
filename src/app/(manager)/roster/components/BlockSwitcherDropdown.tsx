'use client'

import { useRouter } from 'next/navigation'
import { ChevronsUpDown, Check } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import type { RosterBlock } from '@/types/database'

type BlockSummary = Pick<RosterBlock, 'id' | 'name' | 'start_date' | 'end_date' | 'status'>

interface Props {
  currentId: string
  currentLabel: string
  blocks: BlockSummary[]
}

const STATUS_STYLE: Record<string, React.CSSProperties> = {
  draft: { background: 'var(--muted)', color: 'var(--text-dim)' },
  published: { background: 'var(--green-accent-bg)', color: 'var(--green-accent)', border: '1px solid var(--green-accent-border)' },
  archived: { background: 'var(--amber-accent-bg)', color: 'var(--amber-accent)', border: '1px solid var(--amber-accent-border)' },
}

export default function BlockSwitcherDropdown({ currentId, currentLabel, blocks }: Props) {
  const router = useRouter()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            data-testid="block-switcher-trigger"
            className="flex items-center gap-1.5 rounded-lg px-1.5 py-0.5 text-lg font-semibold transition-colors"
            style={{ color: 'var(--foreground)' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          />
        }
      >
        {currentLabel}
        <ChevronsUpDown className="h-3.5 w-3.5" style={{ color: 'var(--text-mute)' }} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1">
        <ul className="flex flex-col gap-0.5">
          {blocks.map(b => {
            const label = b.name ?? `${b.start_date} – ${b.end_date}`
            const isCurrent = b.id === currentId
            return (
              <li key={b.id}>
                <button
                  onClick={() => router.push(`/roster/${b.id}`)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors',
                    isCurrent ? 'font-medium' : ''
                  )}
                  style={{ color: 'var(--foreground)', background: isCurrent ? 'var(--surface-active)' : 'transparent' }}
                  onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.background = 'var(--surface-hover)' }}
                  onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.background = 'transparent' }}
                >
                  <Check
                    className={cn('h-3.5 w-3.5 shrink-0', isCurrent ? 'opacity-100' : 'opacity-0')}
                    style={{ color: 'var(--green-accent)' }}
                  />
                  <span className="flex-1 truncate">{label}</span>
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 text-xs capitalize"
                    style={STATUS_STYLE[b.status] ?? { background: 'var(--muted)', color: 'var(--text-dim)' }}
                  >
                    {b.status}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
