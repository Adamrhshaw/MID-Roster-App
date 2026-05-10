import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return true
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  return !!user
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  if (!await requireAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { blockId } = await params
  const supabase = createServiceClient()

  const { data: block, error: blockErr } = await supabase
    .from('roster_blocks')
    .select('id, name, start_date, end_date, status, published_at')
    .eq('id', blockId)
    .single()

  if (blockErr || !block) return NextResponse.json({ error: 'Block not found' }, { status: 404 })

  // Idempotent: archiving an archived block is a no-op.
  if (block.status === 'archived') {
    return NextResponse.json({ block })
  }

  if (block.status !== 'published') {
    return NextResponse.json(
      { error: `Cannot archive a ${block.status} block — only published blocks can be archived` },
      { status: 409 }
    )
  }

  const { data: updated, error: updateErr } = await supabase
    .from('roster_blocks')
    .update({ status: 'archived' })
    .eq('id', blockId)
    .select('id, name, start_date, end_date, status, published_at')
    .single()

  if (updateErr || !updated) {
    return NextResponse.json({ error: updateErr?.message ?? 'Update failed' }, { status: 500 })
  }

  return NextResponse.json({ block: updated })
}
