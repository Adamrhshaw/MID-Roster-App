import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Wand2, Send } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Props {
  params: Promise<{ blockId: string }>
}

export default async function RosterBlockPage({ params }: Props) {
  const { blockId } = await params
  const supabase = await createClient()

  const { data: block } = await supabase
    .from('roster_blocks')
    .select('*')
    .eq('id', blockId)
    .single()

  if (!block) notFound()

  const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
    draft: 'secondary',
    published: 'default',
    archived: 'outline',
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Link
              href="/roster"
              className={cn(
                'inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500',
                'hover:bg-gray-100 hover:text-gray-900 transition-colors'
              )}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-300 cursor-not-allowed">
              <ChevronRight className="h-4 w-4" />
            </span>
          </div>
          <div>
            <h1 className="text-sm font-semibold text-gray-900">
              {block.name ?? `${block.start_date} – ${block.end_date}`}
            </h1>
          </div>
          <Badge variant={statusVariant[block.status] ?? 'secondary'} className="capitalize">
            {block.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5">
            <Wand2 className="h-3.5 w-3.5" />
            Generate Draft
          </Button>
          <Button size="sm" className="gap-1.5" disabled={block.status !== 'draft'}>
            <Send className="h-3.5 w-3.5" />
            Publish
          </Button>
        </div>
      </div>

      {/* Calendar placeholder */}
      <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
        Calendar view coming soon — connect Supabase first.
      </div>
    </div>
  )
}
