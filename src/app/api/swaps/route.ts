import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return { id: 'dev' }
  const serverClient = await createServerClient()
  const { data: { user } } = await serverClient.auth.getUser()
  return user
}

export async function GET() {
  const user = await requireAuth()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('shift_swaps')
    .select(`
      *,
      requester_staff:requester_staff_id(id, full_name, employee_id),
      target_staff:target_staff_id(id, full_name, employee_id),
      requester_assignment:requester_assignment_id(
        id,
        shift_instance:shift_instance_id(shift_date, shift_type, start_time, end_time, area:area_id(name))
      ),
      target_assignment:target_assignment_id(
        id,
        shift_instance:shift_instance_id(shift_date, shift_type, start_time, end_time, area:area_id(name))
      )
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
