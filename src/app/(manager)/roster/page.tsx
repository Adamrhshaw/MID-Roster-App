import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import CreateRosterBlockDialog from './components/CreateRosterBlockDialog'

export default async function RosterIndexPage() {
  // TODO(pre-prod): switch back to createClient() from supabase/server — using service client
  // here because DEV_BYPASS_AUTH skips Supabase auth, leaving no session for the anon client.
  const supabase = createServiceClient()

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
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-lg font-semibold text-gray-800">No roster blocks yet</h1>
        <p className="max-w-xs text-sm text-gray-500">
          Create your first block to stamp shift instances from your configured templates.
        </p>
      </div>
      <CreateRosterBlockDialog triggerLabel="Create first block" />
    </div>
  )
}
