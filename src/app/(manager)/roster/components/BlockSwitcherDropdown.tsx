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

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  published: 'bg-green-100 text-green-700',
  archived: 'bg-amber-100 text-amber-700',
}

export default function BlockSwitcherDropdown({ currentId, currentLabel, blocks }: Props) {
  const router = useRouter()

  return (
    <Popover>
      <PopoverTrigger
        render={
          <button className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-sm font-semibold text-gray-900 hover:bg-gray-100 transition-colors" />
        }
      >
        {currentLabel}
        <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" />
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
                    isCurrent
                      ? 'bg-gray-100 font-medium text-gray-900'
                      : 'text-gray-700 hover:bg-gray-50'
                  )}
                >
                  <Check
                    className={cn('h-3.5 w-3.5 shrink-0', isCurrent ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="flex-1 truncate">{label}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-xs capitalize',
                      STATUS_BADGE[b.status] ?? 'bg-gray-100 text-gray-600'
                    )}
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
