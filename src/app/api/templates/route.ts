import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

// Fixed shift times per domain rules (MRS Award 2025)
const SHIFT_TIMES = {
  morning:   { start_time: '08:00', end_time: '16:00' },
  afternoon: { start_time: '16:00', end_time: '00:00' },
  night:     { start_time: '00:00', end_time: '08:00' },
} as const

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('shift_templates')
    .select('*, area:areas(id, name, min_staff_per_shift, created_at)')
    .order('area_id')
    .order('day_of_week')
    .order('shift_type')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return true
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  return !!user
}

export async function POST(request: Request) {
  if (!await requireAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { area_id, shift_type, day_of_week, required_staff } = body as {
    area_id: string
    shift_type: keyof typeof SHIFT_TIMES
    day_of_week: number
    required_staff: number
  }

  if (!area_id || !shift_type || day_of_week == null) {
    return NextResponse.json({ error: 'area_id, shift_type, and day_of_week are required' }, { status: 400 })
  }
  if (!(shift_type in SHIFT_TIMES)) {
    return NextResponse.json({ error: 'shift_type must be morning, afternoon, or night' }, { status: 400 })
  }

  const times = SHIFT_TIMES[shift_type]
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('shift_templates')
    .insert({
      area_id,
      shift_type,
      day_of_week,
      required_staff: required_staff ?? 1,
      ...times,
      ado_accrual_minutes: 22,
      is_active: true,
    })
    .select('*, area:areas(id, name, min_staff_per_shift, created_at)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
