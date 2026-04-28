# Radiology Rostering — Implementation Tracker

## Legend
- ✅ Complete — functional, connected to Supabase, TypeScript clean
- 🔶 Shell — route/page exists, UI structure only, no real data or actions
- ⬜ Not started

---

## Infrastructure & Auth

| Item | Status | Notes |
|------|--------|-------|
| Next.js scaffold (App Router) | ✅ | Route group `(manager)` for protected pages |
| Supabase project + connection | ✅ | JWT keys in `.env.local` |
| Database schema (migration 001) | ✅ | 13 tables, indexes, RLS policies applied |
| TypeScript types (`src/types/database.ts`) | ✅ | Mirrors schema |
| Supabase SSR clients (browser / server / service) | ✅ | `src/lib/supabase/` |
| Auth middleware (`src/proxy.ts`) | ✅ | Next.js 16 proxy format; guards manager routes |
| Manager login (`/login`) | ✅ | Supabase Auth email/password |
| App navigation (`AppNav`) | ✅ | Roster, Staff, Leave, Swaps, Settings; sign out |

---

## Manager App

### Staff (`/staff`)

| Item | Status |
|------|--------|
| Staff list with real Supabase data | ✅ |
| Search (name / ID / email) | ✅ |
| Add Staff dialog | ✅ |
| Edit Staff slide-over | ✅ |
| Deactivate staff (soft delete) | ✅ |
| Re-activate staff | ✅ |
| `GET/POST /api/staff` | ✅ |
| `PATCH/DELETE /api/staff/[id]` | ✅ |

### Roster (`/roster`, `/roster/[blockId]`)

| Item | Status |
|------|--------|
| Roster index → redirect to latest block | ✅ |
| Roster block page shell | ✅ |
| Create roster block | ✅ |
| Custom roster grid (staff rows × day columns, shift pills) | ✅ |
| Drag-and-drop assignment editing (dnd-kit) | ⬜ |
| Two-tier rule validation on drag | ⬜ |
| Shift assignment popover | ⬜ |
| Open/gap indicators | ⬜ |
| Coverage bar (filled vs required per area) | ⬜ |
| Warnings sidebar (all active violations) | ⬜ |
| Publish / archive block | ⬜ |

### Roster Generation

| Item | Status |
|------|--------|
| `POST /api/roster/[blockId]/generate` | ⬜ |
| Phase 1 — template expansion | ⬜ |
| Phase 2 — leave overlay | ⬜ |
| Phase 3 — gap detection | ⬜ |
| Phase 4 — greedy gap fill | ⬜ |
| Phase 4b — ADO scheduling | ⬜ |
| Phase 5 — generation report | ⬜ |

### Testing

| Item | Status |
|------|--------|
| Vitest setup | ✅ |
| Unit tests — rules engine (one per rule) | ✅ |
| API integration tests — `/api/leave` and `/api/swaps/[id]` | ✅ |

### Rules Engine (`src/lib/rules/`)

| Item | Status |
|------|--------|
| Type definitions (`RuleContext`, `Violation`, `Rule`) | ✅ |
| `minimumRestPeriodRule` (10h between shifts) | ✅ |
| `maxWeeklyHoursRule` (fte × 35h) | ✅ |
| `leaveConflictRule` | ✅ |
| `certificationRequiredRule` | ✅ |
| `areaCoverageRule` (min staff per shift) | ✅ |
| `availabilityRule` (day-of-week availability) | ✅ |
| Client-side warnings store (Zustand) | ⬜ |

### Leave (`/leave`)

| Item | Status |
|------|--------|
| Leave inbox shell (Pending / Approved / Rejected) | ✅ |
| Fetch requests from Supabase | ✅ |
| Approve / reject with roster update | ✅ |
| Email notification (Resend) | ⬜ |

### Swaps (`/swaps`)

| Item | Status |
|------|--------|
| Swap inbox shell | ✅ |
| Fetch requests from Supabase | ✅ |
| Approve / reject with assignment swap | ✅ |
| Email notification (Resend) | ⬜ |

### Settings (`/settings`)

| Item | Status |
|------|--------|
| Settings nav (links to sub-sections) | ✅ |
| Areas CRUD | ✅ |
| Shift template editor (grid: area × day × shift type) | ✅ |

### Export

| Item | Status |
|------|--------|
| `GET /api/export/roster/[blockId]` (CSV + XLSX) | ⬜ |

---

## Staff Portal

| Item | Status |
|------|--------|
| Employee ID entry (`/portal`) | ✅ |
| Session API (`/api/portal/session`) | ✅ |
| Portal home shell — tab structure | 🔶 |
| Session validation for portal routes | ⬜ |
| Calendar tab — read-only roster, own shifts highlighted | ⬜ |
| List tab — shift list | ⬜ |
| Leave tab — submit leave request | ⬜ |
| Swap tab — submit shift swap | ⬜ |
| `POST /api/portal/leave` | ⬜ |
| `POST /api/portal/swap` | ⬜ |
| Session cookie rolling refresh | ⬜ |

---

## Public Roster Viewer (`/view`)

| Item | Status |
|------|--------|
| Redirect to current published block | 🔶 |
| Published block viewer shell | 🔶 |
| Fetch published shifts (anon RLS policy in place) | ⬜ |
| Read-only roster grid + area filter | ⬜ |
| `?highlight=EMP_ID` — dim other shifts | ⬜ |

---

## Design

| Item | Status |
|------|--------|
| shadcn/ui v4 component library | ✅ |
| Visual design pass | ⬜ |

---

## Implementation Progress

1. ~~Areas CRUD (`/settings/areas`) — unblocks templates and staff area selection~~ ✅
2. ~~Shift template editor — prerequisite for roster generation~~ ✅
3. ~~Roster block creation — stamps `shift_instances` from templates~~ ✅
4. ~~Custom roster grid — render read-only grid first (days × staff, shift pills)~~ ✅
5. ~~Leave + Swap inboxes — wire real data + approve/reject~~ ✅
6. ~~Vitest setup + rules engine (unit tests per rule, API integration tests for leave/swaps)~~ ✅
7. Drag-and-drop + rule validation
8. Roster generation algorithm (phases 1–5)
9. Portal — leave + swap submission
10. Email notifications (Resend)
11. Export (CSV / XLSX)
12. Visual design pass (`/frontend-design` skill)
