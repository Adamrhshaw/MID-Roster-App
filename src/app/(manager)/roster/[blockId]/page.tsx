import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Wand2, Send } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import CreateRosterBlockDialog from '../components/CreateRosterBlockDialog'
import BlockSwitcherDropdown from '../components/BlockSwitcherDropdown'
import DeleteRosterBlockButton from '../components/DeleteRosterBlockButton'
import RosterGrid from './RosterGrid'
import type { RosterBlock } from '@/types/database'

interface Props {
  params: Promise<{ blockId: string }>
}

export default async function RosterBlockPage({ params }: Props) {
  const { blockId } = await params
  // TODO(pre-prod): switch back to createClient() from supabase/server — using service client
  // here because DEV_BYPASS_AUTH skips Supabase auth, leaving no session for the anon client.
  const supabase = createServiceClient()

  // Load current block + all blocks for switcher in one query
  const [{ data: block }, { data: allBlocks }] = await Promise.all([
    supabase.from('roster_blocks').select('*').eq('id', blockId).single(),
    supabase
      .from('roster_blocks')
      .select('id, name, start_date, end_date, status')
      .order('start_date', { ascending: false }),
  ])

  if (!block) notFound()

  // Find prev/next by date order (allBlocks is descending: newer first)
  const sortedById = (allBlocks ?? []) as Pick<RosterBlock, 'id' | 'name' | 'start_date' | 'end_date' | 'status'>[]
  const idx = sortedById.findIndex(b => b.id === blockId)
  const prevBlock = idx < sortedById.length - 1 ? sortedById[idx + 1] : null
  const nextBlock = idx > 0 ? sortedById[idx - 1] : null

  const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
    draft: 'secondary',
    published: 'default',
    archived: 'outline',
  }

  const blockLabel = block.name ?? `${block.start_date} – ${block.end_date}`

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          {/* Prev / Next */}
          <div className="flex items-center gap-0.5">
            {prevBlock ? (
              <Link
                href={`/roster/${prevBlock.id}`}
                title={prevBlock.name ?? `${prevBlock.start_date} – ${prevBlock.end_date}`}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500',
                  'hover:bg-gray-100 hover:text-gray-900 transition-colors'
                )}
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-300 cursor-not-allowed">
                <ChevronLeft className="h-4 w-4" />
              </span>
            )}
            {nextBlock ? (
              <Link
                href={`/roster/${nextBlock.id}`}
                title={nextBlock.name ?? `${nextBlock.start_date} – ${nextBlock.end_date}`}
                className={cn(
                  'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500',
                  'hover:bg-gray-100 hover:text-gray-900 transition-colors'
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-300 cursor-not-allowed">
                <ChevronRight className="h-4 w-4" />
              </span>
            )}
          </div>

          {/* Block name + switcher dropdown */}
          <BlockSwitcherDropdown
            currentId={blockId}
            currentLabel={blockLabel}
            blocks={sortedById}
          />
          <Badge variant={statusVariant[block.status] ?? 'secondary'} className="capitalize">
            {block.status}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <CreateRosterBlockDialog triggerVariant="outline" />
          {block.status === 'draft' && (
            <DeleteRosterBlockButton blockId={blockId} blockLabel={blockLabel} />
          )}
          <Button variant="outline" size="sm" className="gap-1.5" disabled>
            <Wand2 className="h-3.5 w-3.5" />
            Generate Draft
          </Button>
          <Button size="sm" className="gap-1.5" disabled={block.status !== 'draft'}>
            <Send className="h-3.5 w-3.5" />
            Publish
          </Button>
        </div>
      </div>

      <RosterGrid
        blockId={blockId}
        startDate={block.start_date}
        endDate={block.end_date}
      />
    </div>
  )
}
