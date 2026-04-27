import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
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

  const { full_name, employee_id, email, phone, fte_target, primary_area_id, area_ids, certification_ids, is_active } =
    body as {
      full_name?: string
      employee_id?: string
      email?: string
      phone?: string | null
      fte_target?: number
      primary_area_id?: string | null
      area_ids?: string[]
      certification_ids?: string[]
      is_active?: boolean
    }

  const supabase = createServiceClient()

  const updates: Record<string, unknown> = {}
  if (full_name !== undefined) updates.full_name = full_name.trim()
  if (employee_id !== undefined) updates.employee_id = employee_id.trim()
  if (email !== undefined) updates.email = email.trim()
  if (phone !== undefined) updates.phone = phone?.trim() || null
  if (fte_target !== undefined) updates.fte_target = fte_target
  if (primary_area_id !== undefined) updates.primary_area_id = primary_area_id || null
  if (is_active !== undefined) updates.is_active = is_active

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase.from('staff').update(updates).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Replace staff_areas if provided
  if (area_ids !== undefined) {
    await supabase.from('staff_areas').delete().eq('staff_id', id)
    const allAreaIds = Array.from(new Set([...area_ids, ...(updates.primary_area_id ? [updates.primary_area_id as string] : [])]))
    if (allAreaIds.length > 0) {
      await supabase.from('staff_areas').insert(
        allAreaIds.map(aid => ({ staff_id: id, area_id: aid, is_primary: aid === (updates.primary_area_id ?? primary_area_id) }))
      )
    }
  }

  // Replace certifications if provided
  if (certification_ids !== undefined) {
    await supabase.from('staff_certifications').delete().eq('staff_id', id)
    if (certification_ids.length > 0) {
      const today = new Date().toISOString().split('T')[0]
      await supabase.from('staff_certifications').insert(
        certification_ids.map(cid => ({ staff_id: id, certification_id: cid, granted_date: today }))
      )
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const supabase = createServiceClient()

  // Soft-delete: set is_active = false rather than hard delete (preserves history)
  const { error } = await supabase.from('staff').update({ is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
