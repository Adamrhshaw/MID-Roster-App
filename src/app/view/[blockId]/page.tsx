import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'

interface Props {
  params: Promise<{ blockId: string }>
  searchParams: Promise<{ highlight?: string }>
}

export default async function PublicRosterViewPage({ params, searchParams }: Props) {
  const { blockId } = await params
  const { highlight } = await searchParams
  const supabase = await createClient()

  const { data: block } = await supabase
    .from('roster_blocks')
    .select('*')
    .eq('id', blockId)
    .eq('status', 'published')
    .single()

  if (!block) notFound()

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div>
            <h1 className="text-sm font-semibold text-gray-900">
              {block.name ?? `${block.start_date} – ${block.end_date}`}
            </h1>
            <p className="text-xs text-gray-500">Radiology Roster</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                placeholder="Enter Employee ID to highlight your shifts"
                className="pl-9 w-72 h-8 text-sm"
                defaultValue={highlight ?? ''}
              />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6">
        <div className="flex items-center justify-center h-96 rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-400">
          Read-only roster calendar — connect Supabase first.
        </div>
      </div>
    </div>
  )
}
