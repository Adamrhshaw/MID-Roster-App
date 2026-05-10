import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { generateRoster } from '@/lib/generator'

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

  // Confirm the block exists and is in a generateable state.
  const { data: block, error: blockErr } = await supabase
    .from('roster_blocks')
    .select('id, status')
    .eq('id', blockId)
    .single()
  if (blockErr || !block) {
    return NextResponse.json({ error: blockErr?.message ?? 'Block not found' }, { status: 404 })
  }
  if (block.status !== 'draft') {
    return NextResponse.json(
      { error: `Cannot generate for ${block.status} block — only drafts can be regenerated` },
      { status: 409 }
    )
  }

  try {
    const report = await generateRoster(supabase, blockId)
    return NextResponse.json(report)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
