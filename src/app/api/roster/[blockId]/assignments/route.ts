import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return { id: 'dev' }
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  return user
}

type SupabaseSrv = ReturnType<typeof createServiceClient>

async function shiftsBelongToBlock(
  supabase: SupabaseSrv,
  blockId: string,
  shiftIds: string[],
): Promise<boolean> {
  const unique = [...new Set(shiftIds)]
  const { data, error } = await supabase
    .from('shift_instances')
    .select('id')
    .in('id', unique)
    .eq('roster_block_id', blockId)
  if (error || !data) return false
  return data.length === unique.length
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

  if (!(await shiftsBelongToBlock(supabase, blockId, [shiftInstanceId]))) {
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

// DELETE /api/roster/[blockId]/assignments
// Body: { shiftInstanceId, staffId }
// Cancels (soft-deletes) the assignment.
export async function DELETE(
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

  if (!(await shiftsBelongToBlock(supabase, blockId, [shiftInstanceId]))) {
    return NextResponse.json({ error: 'Shift not found in this block' }, { status: 404 })
  }

  const { error } = await supabase
    .from('assignments')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('shift_instance_id', shiftInstanceId)
    .eq('staff_id', staffId)
    .neq('status', 'cancelled')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH /api/roster/[blockId]/assignments
// Two operations, distinguished by `op`:
//
//   { op: 'move', staffId, fromShiftInstanceId, toShiftInstanceId }
//     Cancels the staff's assignment on `from` and upserts on `to`.
//
//   { op: 'swap', aStaffId, aShiftInstanceId, bStaffId, bShiftInstanceId }
//     Two staff trade shift_instance_ids. Cancels both originals, upserts the
//     swapped pair. Both shift instances must be in this block.
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

  const supabase = createServiceClient()
  const now = new Date().toISOString()
  const op = (body as { op?: string }).op

  if (op === 'move') {
    const { staffId, fromShiftInstanceId, toShiftInstanceId } = body as {
      staffId?: string
      fromShiftInstanceId?: string
      toShiftInstanceId?: string
    }
    if (!staffId || !fromShiftInstanceId || !toShiftInstanceId) {
      return NextResponse.json({ error: 'staffId, fromShiftInstanceId, toShiftInstanceId required' }, { status: 400 })
    }
    if (fromShiftInstanceId === toShiftInstanceId) {
      return NextResponse.json({ ok: true })
    }

    if (!(await shiftsBelongToBlock(supabase, blockId, [fromShiftInstanceId, toShiftInstanceId]))) {
      return NextResponse.json({ error: 'Shift not found in this block' }, { status: 404 })
    }

    const { error: cancelErr } = await supabase
      .from('assignments')
      .update({ status: 'cancelled', updated_at: now })
      .eq('shift_instance_id', fromShiftInstanceId)
      .eq('staff_id', staffId)
      .neq('status', 'cancelled')
    if (cancelErr) return NextResponse.json({ error: cancelErr.message }, { status: 500 })

    const { error: upsertErr } = await supabase
      .from('assignments')
      .upsert(
        { shift_instance_id: toShiftInstanceId, staff_id: staffId, status: 'confirmed', source: 'manual', updated_at: now },
        { onConflict: 'shift_instance_id,staff_id' }
      )
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  if (op === 'swap') {
    const { aStaffId, aShiftInstanceId, bStaffId, bShiftInstanceId } = body as {
      aStaffId?: string
      aShiftInstanceId?: string
      bStaffId?: string
      bShiftInstanceId?: string
    }
    if (!aStaffId || !aShiftInstanceId || !bStaffId || !bShiftInstanceId) {
      return NextResponse.json({ error: 'aStaffId, aShiftInstanceId, bStaffId, bShiftInstanceId required' }, { status: 400 })
    }
    if (aShiftInstanceId === bShiftInstanceId && aStaffId === bStaffId) {
      return NextResponse.json({ ok: true })
    }

    if (!(await shiftsBelongToBlock(supabase, blockId, [aShiftInstanceId, bShiftInstanceId]))) {
      return NextResponse.json({ error: 'Shift not found in this block' }, { status: 404 })
    }

    // Cancel both originals first to free the (shift, staff) unique slots.
    const { error: cancelErr } = await supabase
      .from('assignments')
      .update({ status: 'cancelled', updated_at: now })
      .or(
        `and(shift_instance_id.eq.${aShiftInstanceId},staff_id.eq.${aStaffId}),and(shift_instance_id.eq.${bShiftInstanceId},staff_id.eq.${bStaffId})`,
      )
      .neq('status', 'cancelled')
    if (cancelErr) return NextResponse.json({ error: cancelErr.message }, { status: 500 })

    const { error: upsertErr } = await supabase
      .from('assignments')
      .upsert(
        [
          { shift_instance_id: bShiftInstanceId, staff_id: aStaffId, status: 'confirmed', source: 'manual', updated_at: now },
          { shift_instance_id: aShiftInstanceId, staff_id: bStaffId, status: 'confirmed', source: 'manual', updated_at: now },
        ],
        { onConflict: 'shift_instance_id,staff_id' }
      )
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown op (expected "move" or "swap")' }, { status: 400 })
}
