/**
 * Integration tests for /api/swaps/[id] (PATCH approve/reject).
 * Uses a real Supabase connection. DEV_BYPASS_AUTH=true skips auth.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { PATCH } from '../swaps/[id]/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Seeded IDs — cleaned up after each test
let staffAId: string
let staffBId: string
let areaId: string
let blockId: string
let shiftAId: string
let shiftBId: string
let assignAId: string
let assignBId: string
let swapId: string

async function seedSwap(status: 'pending' | 'approved' = 'pending', withTarget = true) {
  const ts = Date.now()

  // Area
  const { data: area } = await supabase.from('areas').insert({ name: `TestArea-${ts}`, min_staff_per_shift: 1 }).select('id').single()
  areaId = area!.id

  // Staff
  const { data: a } = await supabase.from('staff').insert({ full_name: 'Staff A', employee_id: `A-${ts}`, email: `a-${ts}@x.com`, fte_target: 1.0 }).select('id').single()
  const { data: b } = await supabase.from('staff').insert({ full_name: 'Staff B', employee_id: `B-${ts}`, email: `b-${ts}@x.com`, fte_target: 1.0 }).select('id').single()
  staffAId = a!.id
  staffBId = b!.id

  // Roster block
  const { data: block } = await supabase.from('roster_blocks').insert({ start_date: '2026-06-01', end_date: '2026-06-28' }).select('id').single()
  blockId = block!.id

  // Two shift instances (different dates so no duplicate constraint)
  const { data: siA } = await supabase.from('shift_instances').insert({ roster_block_id: blockId, area_id: areaId, shift_type: 'morning', shift_date: '2026-06-02', start_time: '08:00', end_time: '16:00' }).select('id').single()
  const { data: siB } = await supabase.from('shift_instances').insert({ roster_block_id: blockId, area_id: areaId, shift_type: 'morning', shift_date: '2026-06-03', start_time: '08:00', end_time: '16:00' }).select('id').single()
  shiftAId = siA!.id
  shiftBId = siB!.id

  // Assignments: A on shiftA, B on shiftB
  const { data: assA } = await supabase.from('assignments').insert({ shift_instance_id: shiftAId, staff_id: staffAId, status: 'confirmed', source: 'manual' }).select('id').single()
  const { data: assB } = await supabase.from('assignments').insert({ shift_instance_id: shiftBId, staff_id: staffBId, status: 'confirmed', source: 'manual' }).select('id').single()
  assignAId = assA!.id
  assignBId = assB!.id

  // Swap request
  const { data: swap } = await supabase.from('shift_swaps').insert({
    requester_staff_id: staffAId,
    requester_assignment_id: assignAId,
    target_staff_id: withTarget ? staffBId : null,
    target_assignment_id: withTarget ? assignBId : null,
    status,
  }).select('id').single()
  swapId = swap!.id
}

async function cleanup() {
  if (swapId) await supabase.from('shift_swaps').delete().eq('id', swapId)
  if (assignAId) await supabase.from('assignments').delete().eq('id', assignAId)
  if (assignBId) await supabase.from('assignments').delete().eq('id', assignBId)
  if (shiftAId) await supabase.from('shift_instances').delete().eq('id', shiftAId)
  if (shiftBId) await supabase.from('shift_instances').delete().eq('id', shiftBId)
  if (blockId) await supabase.from('roster_blocks').delete().eq('id', blockId)
  if (staffAId) await supabase.from('staff').delete().eq('id', staffAId)
  if (staffBId) await supabase.from('staff').delete().eq('id', staffBId)
  if (areaId) await supabase.from('areas').delete().eq('id', areaId)
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/swaps/' + swapId, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  process.env.DEV_BYPASS_AUTH = 'true'
})

afterEach(async () => {
  await cleanup()
})

describe('PATCH /api/swaps/[id]', () => {
  it('rejects a pending swap', async () => {
    await seedSwap('pending')
    const res = await PATCH(makeRequest({ action: 'reject' }), { params: Promise.resolve({ id: swapId }) })
    expect(res.status).toBe(200)

    const { data } = await supabase.from('shift_swaps').select('status').eq('id', swapId).single()
    expect(data?.status).toBe('rejected')
  })

  it('approves a swap — swaps staff_id on both assignments', async () => {
    await seedSwap('pending')
    const res = await PATCH(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: swapId }) })
    expect(res.status).toBe(200)

    // Staff should now be swapped
    const { data: assA } = await supabase.from('assignments').select('staff_id, status, source').eq('id', assignAId).single()
    const { data: assB } = await supabase.from('assignments').select('staff_id, status, source').eq('id', assignBId).single()
    expect(assA?.staff_id).toBe(staffBId)
    expect(assB?.staff_id).toBe(staffAId)
    expect(assA?.status).toBe('swapped')
    expect(assB?.status).toBe('swapped')
    expect(assA?.source).toBe('swap')

    const { data: swap } = await supabase.from('shift_swaps').select('status').eq('id', swapId).single()
    expect(swap?.status).toBe('approved')
  })

  it('returns 400 when approving an open swap (no target assignment)', async () => {
    await seedSwap('pending', false)
    const res = await PATCH(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: swapId }) })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toContain('no swap partner')
  })

  it('returns 409 when trying to approve an already-approved swap', async () => {
    await seedSwap('approved')
    const res = await PATCH(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: swapId }) })
    expect(res.status).toBe(409)
  })

  it('returns 400 for an invalid action', async () => {
    await seedSwap('pending')
    const res = await PATCH(makeRequest({ action: 'cancel' }), { params: Promise.resolve({ id: swapId }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    await seedSwap('pending')
    const req = new Request('http://localhost/api/swaps/' + swapId, { method: 'PATCH', body: 'not-json' })
    const res = await PATCH(req, { params: Promise.resolve({ id: swapId }) })
    expect(res.status).toBe(400)
  })
})
