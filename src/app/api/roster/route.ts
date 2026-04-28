import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { createClient as createServerClient } from '@/lib/supabase/server'

async function requireAuth() {
  if (process.env.DEV_BYPASS_AUTH === 'true') return true
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  return !!user
}

/** Returns an array of ISO date strings (YYYY-MM-DD) for every day in [start, end] inclusive */
function datesInRange(start: string, end: string): string[] {
  const dates: string[] = []
  const cur = new Date(start + 'T00:00:00Z')
  const last = new Date(end + 'T00:00:00Z')
  while (cur <= last) {
    dates.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 1)
  }
  return dates
}

export async function GET() {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('roster_blocks')
    .select('*')
    .order('start_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  if (!await requireAuth()) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, start_date, end_date } = body as {
    name?: string
    start_date: string
    end_date: string
  }

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 })
  }
  if (new Date(end_date) <= new Date(start_date)) {
    return NextResponse.json({ error: 'end_date must be after start_date' }, { status: 400 })
  }

  const supabase = createServiceClient()

  // 1. Create the roster block
  const { data: block, error: blockErr } = await supabase
    .from('roster_blocks')
    .insert({ name: name?.trim() || null, start_date, end_date, status: 'draft' })
    .select()
    .single()

  if (blockErr) return NextResponse.json({ error: blockErr.message }, { status: 500 })

  // 2. Load all active shift templates
  const { data: templates, error: tmplErr } = await supabase
    .from('shift_templates')
    .select('id, area_id, shift_type, start_time, end_time, day_of_week, required_staff')
    .eq('is_active', true)

  if (tmplErr) return NextResponse.json({ error: tmplErr.message }, { status: 500 })

  // 3. Expand templates across every day in the block
  if (templates && templates.length > 0) {
    const dates = datesInRange(start_date, end_date)

    // day_of_week: 0=Monday … 6=Sunday (schema convention) — convert from JS getUTCDay (0=Sun)
    const instances = dates.flatMap(date => {
      const dow = (new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7
      return templates
        .filter(t => t.day_of_week === dow)
        .map(t => ({
          roster_block_id: block.id,
          template_id: t.id,
          area_id: t.area_id,
          shift_type: t.shift_type,
          shift_date: date,
          start_time: t.start_time,
          end_time: t.end_time,
          status: 'open' as const,
        }))
    })

    if (instances.length > 0) {
      const { error: instErr } = await supabase
        .from('shift_instances')
        .insert(instances)

      if (instErr) {
        // Roll back the block so we don't leave an orphan
        await supabase.from('roster_blocks').delete().eq('id', block.id)
        return NextResponse.json({ error: instErr.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json(block, { status: 201 })
}
