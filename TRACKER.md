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

| Item | Status | Notes |
|------|--------|-------|
| Roster index → redirect to latest block | ✅ | |
| Roster block page shell | ✅ | |
| Create roster block | ✅ | stamps shift_instances from active templates (Phase 1 of generation) |
| Roster grid — Core-Schedule-style (NT/AM/PM sections, area rows, staff chips) | ✅ | |
| Drag-and-drop: chip → empty cell = move; chip → chip = swap (cross-section allowed) | ✅ | |
| Two-tier rule validation on drag | ✅ | warnings only — never blocks; generator uses same rules as hard constraints |
| Hover-plus → assign popover, filtered to staff certified for the area | ✅ | |
| Per-cell capacity indicator (filled / required) + bottom coverage bar | ✅ | |
| Violations bell + popover (toolbar) | ✅ | |
| Violation click → jump to week + highlight chip | ✅ | |
| Publish / archive block | ✅ | `POST /api/roster/[blockId]/publish` (with `?force=true` override for unresolvable gaps) and `POST .../archive` (idempotent); header buttons: Publish (draft) / Archive (published) |

### Roster Generation

| Item | Status | Notes |
|------|--------|-------|
| `POST /api/roster/[blockId]/generate` | ✅ | |
| Phase 1 — template expansion | ✅ | done at block creation in `POST /api/roster` |
| Phase 2 — leave overlay | ✅ | cancels assignments overlapping approved leave |
| Phase 3 — gap detection | ✅ | priority: safety-critical → earlier date → night first |
| Phase 4 — greedy gap fill | ✅ | hard constraints (rest, FTE, leave, area, availability); fairness via fewest-hours-first |
| Phase 4b — ADO scheduling | ✅ | 22 min/shift accrual, 480 min threshold, defers + carries forward if no slot |
| Phase 5 — generation report | ✅ | filled/preserved/cancelled/ado counts + unresolvable gap list |
| Generate Draft button (manager UI) | ✅ | re-hydrates `rosterStore` after generation |

### Testing

| Item | Status | Notes |
|------|--------|-------|
| Vitest setup | ✅ | requires `.env.local` with Supabase credentials |
| Unit tests — rules engine (one per rule) | ✅ | `src/lib/rules/__tests__/` |
| API integration tests — `/api/leave` and `/api/swaps/[id]` | ✅ | hit real DB; seed + clean per test |
| Playwright e2e — publish/archive + `/view` visibility | ✅ | `e2e/publish-archive.spec.ts`, `e2e/view.spec.ts`; 10 specs; `npm run test:e2e` |
| Unit tests — generator phases (`src/lib/generator/`) | ✅ | `src/lib/generator/__tests__/`; 24 tests across leaveOverlay / detectGaps / fillGaps / scheduleAdo |
| Integration test — `POST /api/roster/[blockId]/generate` | ✅ | `src/app/api/__tests__/generate.test.ts`; 3 tests; seeds block + leave + manual assignments, asserts assignments + ado_accruals + generated_at |

### Rules Engine (`src/lib/rules/`)

| Item | Status |
|------|--------|
| Type definitions (`RuleContext`, `Violation`, `Rule`) | ✅ |
| `minimumRestPeriodRule` (10h between shifts; handles midnight-crossing shifts) | ✅ |
| `maxWeeklyHoursRule` (fte × 35h) | ✅ |
| `leaveConflictRule` | ✅ |
| `certificationRequiredRule` | ✅ |
| `areaCoverageRule` (min staff per shift) | ✅ |
| `availabilityRule` (day-of-week availability) | ✅ |
| Client-side warnings store (Zustand) | ✅ |

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
| Redirect to current published block | ✅ |
| Published block viewer shell — header + label + full grid | ✅ |
| Anon RLS policy applied (migration 002) | ✅ |
| Fetch published shifts | ✅ |
| Read-only roster grid + area filter | ✅ |
| `?highlight=EMP_ID` — dim other shifts | ✅ |

---

## Design

| Item | Status |
|------|--------|
| shadcn/ui v4 component library | ✅ |
| Visual design pass | ✅ |

---

## Implementation Progress

1. ~~Areas CRUD (`/settings/areas`) — unblocks templates and staff area selection~~ ✅
2. ~~Shift template editor — prerequisite for roster generation~~ ✅
3. ~~Roster block creation — stamps `shift_instances` from templates~~ ✅
4. ~~Custom roster grid — render read-only grid first (days × staff, shift pills)~~ ✅
5. ~~Leave + Swap inboxes — wire real data + approve/reject~~ ✅
6. ~~Vitest setup + rules engine (unit tests per rule, API integration tests for leave/swaps)~~ ✅
7. ~~Drag-and-drop + rule validation~~ ✅
8. ~~Restructure roster grid to Core-Schedule layout (AM/PM/NT × area rows, chip-in-cell)~~ ✅
9. ~~Roster generation algorithm (phases 1–5)~~ ✅
10. ~~Publish / archive block — closes the draft → live → archived lifecycle and exposes blocks to `/view`~~ ✅
11. ~~Generator tests — phase-level unit tests + an end-to-end integration test against a seeded block~~ ✅
12. Portal — leave + swap submission
13. Email notifications (Resend)
14. Export (CSV / XLSX)
15. ~~Visual design pass — Resend-inspired dark theme, Inter font, prototype TopNav, roster grid dark colors~~ ✅
