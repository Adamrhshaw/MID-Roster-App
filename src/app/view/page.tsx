import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function ViewIndexPage() {
  const supabase = await createClient()

  const { data: block } = await supabase
    .from('roster_blocks')
    .select('id')
    .eq('status', 'published')
    .order('start_date', { ascending: false })
    .limit(1)
    .single()

  if (block) {
    redirect(`/view/${block.id}`)
  }

  return (
    <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: 'var(--text-mute)' }}>
      No published roster available yet.
    </div>
  )
}
