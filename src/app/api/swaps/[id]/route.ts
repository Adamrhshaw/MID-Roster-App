import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return { id: 'dev' }
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  return user
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { action } = body as { action?: string }
  if (action !== 'approve' && action !== 'reject') {
    return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const reviewedBy = user.id === 'dev' ? null : user.id

  if (action === 'reject') {
    const { error } = await supabase
      .from('shift_swaps')
      .update({ status: 'rejected', reviewed_by: reviewedBy })
      .eq('id', id)
      .eq('status', 'pending')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Approve: fetch swap, validate, swap assignments, mark approved
  const { data: swap, error: swapErr } = await supabase
    .from('shift_swaps')
    .select('id, status, requester_assignment_id, target_assignment_id')
    .eq('id', id)
    .single()

  if (swapErr || !swap) return NextResponse.json({ error: 'Swap not found' }, { status: 404 })
  if (swap.status !== 'pending') return NextResponse.json({ error: 'Swap is no longer pending' }, { status: 409 })
  if (!swap.target_assignment_id) {
    return NextResponse.json({ error: 'Cannot approve: no swap partner assigned' }, { status: 400 })
  }

  // Fetch both assignments in parallel
  const [{ data: reqAssignment, error: reqErr }, { data: tgtAssignment, error: tgtErr }] = await Promise.all([
    supabase.from('assignments').select('id, staff_id').eq('id', swap.requester_assignment_id).single(),
    supabase.from('assignments').select('id, staff_id').eq('id', swap.target_assignment_id).single(),
  ])

  if (reqErr || !reqAssignment) return NextResponse.json({ error: 'Requester assignment not found' }, { status: 404 })
  if (tgtErr || !tgtAssignment) return NextResponse.json({ error: 'Target assignment not found' }, { status: 404 })

  // Swap staff_id on both assignments
  const [{ error: updateReqErr }, { error: updateTgtErr }] = await Promise.all([
    supabase
      .from('assignments')
      .update({ staff_id: tgtAssignment.staff_id, status: 'swapped', source: 'swap' })
      .eq('id', swap.requester_assignment_id),
    supabase
      .from('assignments')
      .update({ staff_id: reqAssignment.staff_id, status: 'swapped', source: 'swap' })
      .eq('id', swap.target_assignment_id),
  ])

  if (updateReqErr || updateTgtErr) {
    const pgErr = updateReqErr ?? updateTgtErr
    // Postgres unique constraint violation — staff already assigned to that shift instance
    if (pgErr?.code === '23505') {
      return NextResponse.json(
        { error: 'Swap would create a duplicate assignment on this shift.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: pgErr?.message ?? 'Failed to update assignments' }, { status: 500 })
  }

  // Mark swap approved
  const { error: approveErr } = await supabase
    .from('shift_swaps')
    .update({ status: 'approved', reviewed_by: reviewedBy })
    .eq('id', id)

  if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
