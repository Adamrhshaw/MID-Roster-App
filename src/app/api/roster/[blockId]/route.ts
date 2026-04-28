import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return true
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  return !!user
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  if (!await requireAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { blockId } = await params
  const supabase = createServiceClient()

  // Only draft blocks can be deleted
  const { data: block, error: fetchErr } = await supabase
    .from('roster_blocks')
    .select('id, status')
    .eq('id', blockId)
    .single()

  if (fetchErr || !block) return NextResponse.json({ error: 'Block not found' }, { status: 404 })
  if (block.status !== 'draft') {
    return NextResponse.json({ error: 'Only draft blocks can be deleted' }, { status: 409 })
  }

  // Cascade: delete shift_instances (assignments cascade via FK)
  await supabase.from('shift_instances').delete().eq('roster_block_id', blockId)

  const { error: deleteErr } = await supabase
    .from('roster_blocks')
    .delete()
    .eq('id', blockId)

  if (deleteErr) return NextResponse.json({ error: deleteErr.message }, { status: 500 })

  return new NextResponse(null, { status: 204 })
}
