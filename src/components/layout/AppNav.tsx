'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Eye, LogOut, ChevronsUpDown, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useState, useEffect, useRef } from 'react'

const navItems = [
  { href: '/roster', label: 'Roster' },
  { href: '/staff', label: 'Staff' },
  { href: '/leave', label: 'Leave' },
  { href: '/swaps', label: 'Swaps' },
  { href: '/settings', label: 'Settings' },
]

function usePendingCounts() {
  const [counts, setCounts] = useState({ leave: 0, swaps: 0 })
  useEffect(() => {
    Promise.all([
      fetch('/api/leave?status=pending').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/swaps?status=pending').then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([leave, swaps]) => {
      setCounts({
        leave: leave?.data?.length ?? 0,
        swaps: swaps?.data?.length ?? 0,
      })
    })
  }, [])
  return counts
}

export function AppNav() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const counts = usePendingCounts()
  const [userOpen, setUserOpen] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? null)
    })
  }, [supabase])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setUserOpen(false)
      }
    }
    if (userOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [userOpen])

  async function handleSignOut() {
    setUserOpen(false)
    await supabase.auth.signOut()
    router.push('/login')
  }

  const badgeCounts: Record<string, number> = {
    '/leave': counts.leave,
    '/swaps': counts.swaps,
  }

  const userInitial = userEmail ? userEmail[0].toUpperCase() : 'J'
  const userName = userEmail ? userEmail.split('@')[0] : 'manager'

  return (
    <header
      className="flex items-center justify-between gap-6 px-6 shrink-0"
      style={{
        height: 52,
        borderBottom: '1px solid var(--border)',
        background: 'var(--background)',
        position: 'sticky',
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Left: workspace pill + nav */}
      <div className="flex items-center gap-4 min-w-0">
        <div
          className="flex items-center gap-2 rounded-lg px-2 py-1 cursor-pointer transition-colors"
          style={{ fontSize: 13 }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-hover)')}
          onMouseLeave={e => (e.currentTarget.style.background = '')}
        >
          <div
            className="flex items-center justify-center rounded-lg font-semibold text-xs text-white shrink-0"
            style={{
              width: 26,
              height: 26,
              background: 'linear-gradient(135deg, #6c5fc7, #a78bfa)',
            }}
          >
            A
          </div>
          <span className="font-medium text-sm">adam-rostering</span>
          <ChevronsUpDown className="h-3 w-3" style={{ color: 'var(--text-mute)' }} />
        </div>

        <nav className="flex items-center gap-0.5">
          {navItems.map(({ href, label }) => {
            const badge = badgeCounts[href] ?? 0
            const isActive = pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  background: isActive ? 'var(--surface-active)' : 'transparent',
                  color: isActive ? 'var(--foreground)' : 'var(--text-dim)',
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--foreground)' } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' } }}
              >
                <span>{label}</span>
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right: secondary links + user pill */}
      <div className="flex items-center gap-1">
        <Link
          href="/portal"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors"
          style={{ color: 'var(--text-mute)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.background = 'var(--surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-mute)'; e.currentTarget.style.background = 'transparent' }}
          target="_blank"
        >
          <User className="h-3.5 w-3.5" />
          <span>Staff Portal</span>
        </Link>
        <Link
          href="/view"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors"
          style={{ color: 'var(--text-mute)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.background = 'var(--surface-hover)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-mute)'; e.currentTarget.style.background = 'transparent' }}
          target="_blank"
        >
          <Eye className="h-3.5 w-3.5" />
          <span>Public View</span>
        </Link>

        <span
          className="mx-1.5 inline-block"
          style={{ width: 1, height: 18, background: 'var(--border)' }}
        />

        {/* User pill with sign-out dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setUserOpen(o => !o)}
            className="inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[12.5px] transition-colors cursor-pointer"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--text-dim)',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--foreground)'; e.currentTarget.style.background = 'var(--surface-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'var(--card)' }}
          >
            <div
              className="flex items-center justify-center rounded-full font-semibold text-[11px] shrink-0"
              style={{
                width: 22,
                height: 22,
                background: 'linear-gradient(135deg, #4ade80, #14b8a6)',
                color: '#0a0a0a',
              }}
            >
              {userInitial}
            </div>
            <span>{userName}</span>
          </button>

          {userOpen && (
            <div
              className="absolute right-0 top-full mt-1 min-w-[160px] rounded-lg py-1 z-50"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              }}
            >
              {userEmail && (
                <div
                  className="px-3 py-2 text-[11.5px] truncate"
                  style={{
                    color: 'var(--text-mute)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  {userEmail}
                </div>
              )}
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2 px-3 py-2 text-[13px] transition-colors"
                style={{ color: 'var(--text-dim)' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.color = 'var(--foreground)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dim)' }}
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
