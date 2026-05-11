/**
 * Integration tests for POST /api/roster/[blockId]/generate.
 * Uses a real Supabase connection — requires NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.  DEV_BYPASS_AUTH=true skips auth.
 *
 * Scenario:
 *   - Alice + Bob, both in the test area.
 *   - shiftManual  (07-Jul): Alice pre-assigned manually → must survive generation.
 *   - shiftLeave   (08-Jul): Alice pre-assigned manually, Alice has approved leave → must be cancelled.
 *   - shiftEmpty   (09-Jul): no pre-assignment → generator must fill it.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { POST } from '../roster/[blockId]/generate/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Seeded IDs — cleaned up in afterEach
let areaId: string
let aliceId: string
let bobId: string
let blockId: string
let shiftManualId: string
let shiftLeaveId: string
let shiftEmptyId: string
let leaveId: string
let aliceManualAssignId: string
let aliceLeaveAssignId: string

async function seed() {
  const ts = Date.now()

  const { data: area } = await supabase
    .from('areas')
    .insert({ name: `GenTest-${ts}`, min_staff_per_shift: 1 })
    .select('id').single()
  areaId = area!.id

  const { data: alice } = await supabase
    .from('staff')
    .insert({ full_name: 'Alice Gen', employee_id: `AG-${ts}`, email: `alice-${ts}@gen.test`, fte_target: 1.0 })
    .select('id').single()
  aliceId = alice!.id

  const { data: bob } = await supabase
    .from('staff')
    .insert({ full_name: 'Bob Gen', employee_id: `BG-${ts}`, email: `bob-${ts}@gen.test`, fte_target: 1.0 })
    .select('id').single()
  bobId = bob!.id

  await supabase.from('staff_areas').insert([
    { staff_id: aliceId, area_id: areaId, is_primary: true },
    { staff_id: bobId,   area_id: areaId, is_primary: true },
  ])

  // Block: 3-day window, status='draft'. template_id=null so required_staff defaults to 1.
  const { data: block } = await supabase
    .from('roster_blocks')
    .insert({ start_date: '2026-07-07', end_date: '2026-07-09', status: 'draft' })
    .select('id').single()
  blockId = block!.id

  const { data: siManual } = await supabase
    .from('shift_instances')
    .insert({ roster_block_id: blockId, area_id: areaId, shift_type: 'morning', shift_date: '2026-07-07', start_time: '08:00:00', end_time: '16:00:00' })
    .select('id').single()
  shiftManualId = siManual!.id

  const { data: siLeave } = await supabase
    .from('shift_instances')
    .insert({ roster_block_id: blockId, area_id: areaId, shift_type: 'morning', shift_date: '2026-07-08', start_time: '08:00:00', end_time: '16:00:00' })
    .select('id').single()
  shiftLeaveId = siLeave!.id

  const { data: siEmpty } = await supabase
    .from('shift_instances')
    .insert({ roster_block_id: blockId, area_id: areaId, shift_type: 'morning', shift_date: '2026-07-09', start_time: '08:00:00', end_time: '16:00:00' })
    .select('id').single()
  shiftEmptyId = siEmpty!.id

  const { data: aManual } = await supabase
    .from('assignments')
    .insert({ shift_instance_id: shiftManualId, staff_id: aliceId, status: 'confirmed', source: 'manual' })
    .select('id').single()
  aliceManualAssignId = aManual!.id

  const { data: aLeave } = await supabase
    .from('assignments')
    .insert({ shift_instance_id: shiftLeaveId, staff_id: aliceId, status: 'confirmed', source: 'manual' })
    .select('id').single()
  aliceLeaveAssignId = aLeave!.id

  const { data: leave } = await supabase
    .from('leave_requests')
    .insert({ staff_id: aliceId, leave_type: 'annual', start_date: '2026-07-08', end_date: '2026-07-08', status: 'approved' })
    .select('id').single()
  leaveId = leave!.id
}

async function cleanup() {
  // Respect FK ordering: child rows before parent rows.
  if (blockId) await supabase.from('ado_accruals').delete().eq('roster_block_id', blockId)
  if (shiftManualId) await supabase.from('assignments').delete().eq('shift_instance_id', shiftManualId)
  if (shiftLeaveId)  await supabase.from('assignments').delete().eq('shift_instance_id', shiftLeaveId)
  if (shiftEmptyId)  await supabase.from('assignments').delete().eq('shift_instance_id', shiftEmptyId)
  if (leaveId) await supabase.from('leave_requests').delete().eq('id', leaveId)
  if (shiftManualId) await supabase.from('shift_instances').delete().eq('id', shiftManualId)
  if (shiftLeaveId)  await supabase.from('shift_instances').delete().eq('id', shiftLeaveId)
  if (shiftEmptyId)  await supabase.from('shift_instances').delete().eq('id', shiftEmptyId)
  if (aliceId) await supabase.from('staff_areas').delete().eq('staff_id', aliceId)
  if (bobId)   await supabase.from('staff_areas').delete().eq('staff_id', bobId)
  if (blockId) await supabase.from('roster_blocks').delete().eq('id', blockId)
  if (aliceId) await supabase.from('staff').delete().eq('id', aliceId)
  if (bobId)   await supabase.from('staff').delete().eq('id', bobId)
  if (areaId)  await supabase.from('areas').delete().eq('id', areaId)
}

beforeEach(() => {
  process.env.DEV_BYPASS_AUTH = 'true'
})

afterEach(async () => {
  await cleanup()
})

describe('POST /api/roster/[blockId]/generate', () => {
  it('returns 404 for a non-existent block', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000'
    const res = await POST(
      new Request(`http://localhost/api/roster/${fakeId}/generate`, { method: 'POST' }),
      { params: Promise.resolve({ blockId: fakeId }) }
    )
    expect(res.status).toBe(404)
  })

  it('returns 409 when the block is not in draft status', async () => {
    await seed()
    await supabase.from('roster_blocks').update({ status: 'published' }).eq('id', blockId)
    const res = await POST(
      new Request(`http://localhost/api/roster/${blockId}/generate`, { method: 'POST' }),
      { params: Promise.resolve({ blockId }) }
    )
    expect(res.status).toBe(409)
  })

  // The generate call issues ~10 DB round-trips; 30s gives plenty of headroom.
  it('generates assignments, preserves manual rows, cancels leave conflicts, and records ADO accrual', async () => {
    await seed()
    const res = await POST(
      new Request(`http://localhost/api/roster/${blockId}/generate`, { method: 'POST' }),
      { params: Promise.resolve({ blockId }) }
    )
    expect(res.status).toBe(200)
    const report = await res.json()

    // Two gaps should have been filled: shiftLeave (after leave cancel) + shiftEmpty
    expect(report.filledCount).toBeGreaterThan(0)
    expect(report.cancelledByLeave).toBe(1)
    // Alice's manual on shiftManual is the only surviving manual assignment
    expect(report.preservedManualAssignments).toBe(1)

    // --- Verify persisted DB state ---

    // Alice's shiftManual assignment: source must still be 'manual' and not cancelled
    const { data: manualRow } = await supabase
      .from('assignments')
      .select('status, source')
      .eq('id', aliceManualAssignId)
      .single()
    expect(manualRow?.source).toBe('manual')
    expect(manualRow?.status).not.toBe('cancelled')

    // Alice's shiftLeave assignment: cancelled by leave overlay
    const { data: leaveRow } = await supabase
      .from('assignments')
      .select('status')
      .eq('id', aliceLeaveAssignId)
      .single()
    expect(leaveRow?.status).toBe('cancelled')

    // shiftEmpty: at least one non-cancelled generated assignment
    const { data: emptyRows } = await supabase
      .from('assignments')
      .select('source, status')
      .eq('shift_instance_id', shiftEmptyId)
      .neq('status', 'cancelled')
    expect((emptyRows ?? []).length).toBeGreaterThan(0)
    expect(emptyRows![0].source).toBe('generated')

    // ado_accruals: one row per seeded staff member for this block
    const { data: adoRows } = await supabase
      .from('ado_accruals')
      .select('staff_id, accrual_minutes, ado_day_date')
      .eq('roster_block_id', blockId)
      .in('staff_id', [aliceId, bobId])
    const staffWithAccrual = (adoRows ?? []).map(r => r.staff_id)
    expect(staffWithAccrual).toContain(aliceId)
    expect(staffWithAccrual).toContain(bobId)
    // Only 3 shifts in a tiny block — well below the 480-min ADO threshold
    for (const row of adoRows ?? []) {
      expect(row.ado_day_date).toBeNull()
    }

    // Block has a generated_at timestamp
    const { data: updatedBlock } = await supabase
      .from('roster_blocks')
      .select('generated_at')
      .eq('id', blockId)
      .single()
    expect(updatedBlock?.generated_at).not.toBeNull()
  }, 30_000)
})
