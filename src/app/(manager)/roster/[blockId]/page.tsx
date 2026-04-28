import { createServiceClient } from '@/lib/supabase/service'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Wand2, Send } from 'lucide-react'
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
    <div className="flex h-full flex-col p-6 gap-4">
      {/* Above-card header — matches staff page pattern */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
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

      {/* Grid card */}
      <div className="flex flex-col flex-1 min-h-0 rounded-lg border border-gray-200 bg-white overflow-hidden">
        <RosterGrid
          blockId={blockId}
          startDate={block.start_date}
          endDate={block.end_date}
        />
      </div>
    </div>
  )
}
