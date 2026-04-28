import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return true
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  return !!user
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, min_staff_per_shift } = body as { name?: string; min_staff_per_shift?: number }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name.trim()
  if (min_staff_per_shift !== undefined) updates.min_staff_per_shift = min_staff_per_shift

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const supabase = createServiceClient()
  const { error } = await supabase.from('areas').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  const { error } = await supabase.from('areas').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
