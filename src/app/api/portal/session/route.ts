import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/service'
import { cookies } from 'next/headers'
import { createHmac } from 'crypto'

const SESSION_COOKIE = 'portal_session'
const MAX_AGE = 60 * 15 // 15 minutes, rolling

// Simple rate limiting via in-memory store (sufficient for department-level tool)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>()

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(ip)
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 })
    return false
  }
  if (entry.count >= 20) return true
  entry.count++
  return false
}

function signSession(staffId: string): string {
  const secret = process.env.PORTAL_SESSION_SECRET ?? 'dev-secret-replace-in-production'
  const payload = `${staffId}:${Date.now()}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for') ?? 'unknown'
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  let body: { employeeId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  const { employeeId } = body
  if (!employeeId?.trim()) {
    // Return identical response to avoid enumeration
    return NextResponse.json({ error: 'Not found' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const { data: staff } = await supabase
    .from('staff')
    .select('id, full_name')
    .eq('employee_id', employeeId.trim())
    .eq('is_active', true)
    .single()

  // Return identical response whether found or not (anti-enumeration)
  if (!staff) {
    return NextResponse.json({ error: 'Not found' }, { status: 401 })
  }

  const token = signSession(staff.id)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: MAX_AGE,
    path: '/portal',
  })

  return NextResponse.json({ ok: true, name: staff.full_name })
}
