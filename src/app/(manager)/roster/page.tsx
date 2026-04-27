import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RosterIndexPage() {
  const supabase = await createClient()

  // Redirect to the most recent non-archived block, or show empty state
  const { data: block } = await supabase
    .from('roster_blocks')
    .select('id')
    .in('status', ['draft', 'published'])
    .order('start_date', { ascending: false })
    .limit(1)
    .single()

  if (block) {
    redirect(`/roster/${block.id}`)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold text-gray-700">No roster blocks yet</h1>
      <p className="text-sm text-gray-500">Create your first roster block to get started.</p>
    </div>
  )
}
