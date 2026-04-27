import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('staff')
    .select(`
      *,
      primary_area:areas!staff_primary_area_id_fkey(id, name),
      staff_areas(area_id, is_primary, area:areas(id, name))
    `)
    .order('full_name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { full_name, employee_id, email, phone, fte_target, primary_area_id, area_ids } =
    body as {
      full_name: string
      employee_id: string
      email: string
      phone?: string
      fte_target: number
      primary_area_id?: string
      area_ids?: string[]
    }

  if (!full_name?.trim() || !employee_id?.trim() || !email?.trim()) {
    return NextResponse.json({ error: 'full_name, employee_id, and email are required' }, { status: 400 })
  }

  const supabase = createServiceClient()

  const { data: staff, error } = await supabase
    .from('staff')
    .insert({ full_name: full_name.trim(), employee_id: employee_id.trim(), email: email.trim(), phone: phone?.trim() || null, fte_target: fte_target ?? 1.0, primary_area_id: primary_area_id || null })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allAreaIds = Array.from(new Set([...(area_ids ?? []), ...(primary_area_id ? [primary_area_id] : [])]))
  if (allAreaIds.length > 0) {
    await supabase.from('staff_areas').insert(
      allAreaIds.map(aid => ({ staff_id: staff.id, area_id: aid, is_primary: aid === primary_area_id }))
    )
  }

  return NextResponse.json(staff, { status: 201 })
}
