/**
 * Integration tests for /api/leave/[id] (PATCH approve/reject).
 * Uses a real Supabase connection — requires NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY to be set (loaded from .env.local by vitest.config.ts).
 * DEV_BYPASS_AUTH=true is set per-test so no real auth session is needed.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { PATCH } from '../leave/[id]/route'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// IDs to clean up after each test
let staffId: string
let leaveId: string

async function seedLeaveRequest(status: 'pending' | 'approved' = 'pending') {
  // Create a staff member
  const { data: staff } = await supabase
    .from('staff')
    .insert({ full_name: 'Test User', employee_id: `TEST-${Date.now()}`, email: `test-${Date.now()}@example.com`, fte_target: 1.0 })
    .select('id')
    .single()
  staffId = staff!.id

  // Create leave request
  const { data: leave } = await supabase
    .from('leave_requests')
    .insert({ staff_id: staffId, leave_type: 'annual', start_date: '2026-06-01', end_date: '2026-06-05', status })
    .select('id')
    .single()
  leaveId = leave!.id
}

async function cleanup() {
  if (leaveId) await supabase.from('leave_requests').delete().eq('id', leaveId)
  if (staffId) await supabase.from('staff').delete().eq('id', staffId)
}

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/leave/' + leaveId, {
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

describe('PATCH /api/leave/[id]', () => {
  it('approves a pending leave request', async () => {
    await seedLeaveRequest('pending')
    const res = await PATCH(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: leaveId }) })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)

    const { data } = await supabase.from('leave_requests').select('status').eq('id', leaveId).single()
    expect(data?.status).toBe('approved')
  })

  it('rejects a pending leave request', async () => {
    await seedLeaveRequest('pending')
    const res = await PATCH(makeRequest({ action: 'reject' }), { params: Promise.resolve({ id: leaveId }) })
    expect(res.status).toBe(200)

    const { data } = await supabase.from('leave_requests').select('status').eq('id', leaveId).single()
    expect(data?.status).toBe('rejected')
  })

  it('is idempotent — approving an already-approved request is a no-op', async () => {
    await seedLeaveRequest('approved')
    const res = await PATCH(makeRequest({ action: 'approve' }), { params: Promise.resolve({ id: leaveId }) })
    // The .eq('status', 'pending') guard means 0 rows updated — still returns 200 ok
    expect(res.status).toBe(200)
    const { data } = await supabase.from('leave_requests').select('status').eq('id', leaveId).single()
    expect(data?.status).toBe('approved') // unchanged
  })

  it('returns 400 for an invalid action', async () => {
    await seedLeaveRequest('pending')
    const res = await PATCH(makeRequest({ action: 'banana' }), { params: Promise.resolve({ id: leaveId }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 for missing action', async () => {
    await seedLeaveRequest('pending')
    const res = await PATCH(makeRequest({}), { params: Promise.resolve({ id: leaveId }) })
    expect(res.status).toBe(400)
  })

  it('returns 400 for invalid JSON', async () => {
    await seedLeaveRequest('pending')
    const req = new Request('http://localhost/api/leave/' + leaveId, {
      method: 'PATCH',
      body: 'not-json',
    })
    const res = await PATCH(req, { params: Promise.resolve({ id: leaveId }) })
    expect(res.status).toBe(400)
  })
})
