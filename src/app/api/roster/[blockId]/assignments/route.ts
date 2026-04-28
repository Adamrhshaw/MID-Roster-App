import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return { id: 'dev' }
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  return user
}

// POST /api/roster/[blockId]/assignments
// Body: { shiftInstanceId, staffId }
// Assigns staffId to the shift instance.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { blockId } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { shiftInstanceId, staffId } = body as { shiftInstanceId?: string; staffId?: string }
  if (!shiftInstanceId || !staffId) {
    return NextResponse.json({ error: 'shiftInstanceId and staffId are required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: shift, error: shiftErr } = await supabase
    .from('shift_instances')
    .select('id, roster_block_id')
    .eq('id', shiftInstanceId)
    .eq('roster_block_id', blockId)
    .single()

  if (shiftErr || !shift) {
    return NextResponse.json({ error: 'Shift not found in this block' }, { status: 404 })
  }

  const { error } = await supabase
    .from('assignments')
    .upsert(
      { shift_instance_id: shiftInstanceId, staff_id: staffId, status: 'confirmed', source: 'manual', updated_at: new Date().toISOString() },
      { onConflict: 'shift_instance_id,staff_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}

// PATCH /api/roster/[blockId]/assignments
// Body: { shiftInstanceId, fromStaffId, toStaffId }
// Unassigns fromStaffId from the shift and assigns toStaffId.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ blockId: string }> }
) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { blockId } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { shiftInstanceId, fromStaffId, toStaffId } = body as {
    shiftInstanceId?: string
    fromStaffId?: string
    toStaffId?: string
  }

  if (!shiftInstanceId || !fromStaffId || !toStaffId) {
    return NextResponse.json({ error: 'shiftInstanceId, fromStaffId, and toStaffId are required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // Verify shift belongs to this block
  const { data: shift, error: shiftErr } = await supabase
    .from('shift_instances')
    .select('id, roster_block_id')
    .eq('id', shiftInstanceId)
    .eq('roster_block_id', blockId)
    .single()

  if (shiftErr || !shift) {
    return NextResponse.json({ error: 'Shift not found in this block' }, { status: 404 })
  }

  // Cancel existing assignment for fromStaff
  const { error: cancelErr } = await supabase
    .from('assignments')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('shift_instance_id', shiftInstanceId)
    .eq('staff_id', fromStaffId)
    .neq('status', 'cancelled')

  if (cancelErr) return NextResponse.json({ error: cancelErr.message }, { status: 500 })

  // Upsert assignment for toStaff (may already exist as cancelled or never existed)
  const { error: upsertErr } = await supabase
    .from('assignments')
    .upsert(
      {
        shift_instance_id: shiftInstanceId,
        staff_id: toStaffId,
        status: 'confirmed',
        source: 'manual',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'shift_instance_id,staff_id' }
    )

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
