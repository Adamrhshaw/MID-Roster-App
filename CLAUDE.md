@AGENTS.md

## Project

Radiology Department staff rostering web app for NSW Health (MRS Award 2025).
Three modalities: X-Ray, Ultrasound, CT. 3 shifts/day (morning/afternoon/night), 4-week roster blocks.


See [DESIGN.md](DESIGN.md) for the full technical design document (schema, rules engine, generation algorithm, UI wireframes).
See [TRACKER.md](TRACKER.md) for what is built vs what is outstanding. Always update the tracker after committing, including the Implentation progress section.


## Stack

- **Next.js 16** — App Router. Read `node_modules/next/dist/docs/` before writing any Next.js code.
- **Supabase** — PostgreSQL + Auth. Migration applied: `supabase/migrations/001_initial_schema.sql`
- **shadcn/ui v4** — uses `@base-ui/react`, NOT Radix UI. No `asChild` prop on any component.
- **Tailwind CSS v4**
- **TypeScript** — strict. Run `node node_modules/typescript/lib/tsc.js --noEmit` to check (the `tsc` binary is broken).

## Key Breaking Changes to Know

### Next.js 16
- `src/middleware.ts` → `src/proxy.ts`
- Export `proxy` function (not `middleware`)
- Read the docs before using any Next.js API — many things changed from v14/v15.

### shadcn/ui v4 + base-ui
- Uses `@base-ui/react` packages, e.g. `@base-ui/react/dialog`, `@base-ui/react/select`
- **No `asChild` prop** — use the `render` prop instead for polymorphic rendering:
  ```tsx
  // Correct:
  <DialogPrimitive.Close render={<Button variant="ghost" size="icon-sm" />}>
  // Wrong — asChild doesn't exist:
  <Button asChild><a href="...">Link</a></Button>
  ```
- `DialogTrigger`, `PopoverTrigger`, `SheetTrigger` all use the same `render` prop pattern
- `Select.onValueChange` returns `string | null` — always null-coalesce

### Supabase API Keys
- The new `sb_publishable_...` / `sb_secret_...` key format is **not yet supported** by supabase-js
- Must use legacy JWT keys (anon / service_role) — these are set in `.env.local`
- `.env.local` has all required vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PORTAL_SESSION_SECRET`

## Supabase Clients

| File | Use for |
|------|---------|
| `src/lib/supabase/client.ts` | Client components (browser) |
| `src/lib/supabase/server.ts` | Server components + API routes (exports `createClient`) |
| `src/lib/supabase/service.ts` | API routes that need to bypass RLS (exports `createServiceClient`) |

> **Pre-prod checklist — Supabase client swap:**
> The roster index and block pages (`src/app/(manager)/roster/page.tsx` and `src/app/(manager)/roster/[blockId]/page.tsx`) were temporarily switched to `createServiceClient` (bypasses RLS) because `DEV_BYPASS_AUTH=true` means no Supabase session cookie exists during local development.
> Before going to production, switch these two pages back to `createClient` from `src/lib/supabase/server.ts` so they run under the authenticated user's session and RLS policies apply correctly.

## Auth Model

- **Managers**: Supabase Auth (email/password). Protected by `src/proxy.ts` middleware.
- **Staff portal**: No auth. Employee ID entry only → HMAC-signed session cookie (15 min rolling, httpOnly, scoped to `/portal`). Manager reviews all requests.

## Domain Rules

- Standard week = **35 hours** (Diagnostic Radiographers, MRS Award 2025)
- Part-time staff use `fte_target` (e.g. 0.5 = 17.5h/week)
- Shifts: Morning 08:00–16:00, Afternoon 16:00–00:00, Night 00:00–08:00
- **ADO accrual**: 38-min unpaid break per shift; 22 min accrues toward ADO. ~480 min threshold = 1 ADO day. Carry-forward tracked in `ado_accruals`.
- **All rule violations are warnings only** — no hard blocks on manual changes. Manager has final authority.
- `staff_classifications` table intentionally excluded — award level tracking not needed for rostering.

## UI Components

Use the `shadcn` CLI to install and manage UI components. Never manually create component files that shadcn can generate.

```bash
npx shadcn@latest add <component>
```

## Testing

Run tests with `npm test` (Vitest, requires `.env.local` with Supabase credentials).

- **Unit tests** — `src/lib/rules/__tests__/` — pure functions, no DB required
- **Integration tests** — `src/app/api/__tests__/` — hit real Supabase; seed + clean up per test

Do not mock the Supabase client in integration tests — tests must use the real DB to catch constraint/FK issues.

## File Structure (key paths)

```
src/
  app/
    (manager)/          ← protected; requires Supabase Auth session
      staff/            ← ✅ fully implemented
      roster/[blockId]/ ← ✅ read-only grid
      leave/            ← ✅ inbox with approve/reject
      swaps/            ← ✅ inbox with approve/reject
      settings/         ← ✅ areas + templates CRUD
    api/
      staff/            ← ✅ GET, POST, PATCH, DELETE
      leave/            ← ✅ GET, PATCH (approve/reject)
      swaps/            ← ✅ GET, PATCH (approve/reject + assignment swap)
      portal/session/   ← ✅ Employee ID lookup + cookie
    portal/             ← staff portal (no auth required)
    view/               ← public read-only roster viewer
  lib/
    supabase/           ← client / server / service helpers
    rules/              ← ✅ 6 rules: minimumRestPeriod, maxWeeklyHours,
    │                        leaveConflict, availability, areaCoverage,
    │                        certificationRequired
    generator/          ← ⬜ roster generation (not yet built)
    notifications/      ← ⬜ email via Resend (not yet built)
  types/database.ts     ← TypeScript interfaces for all DB tables
```

## planning.md

The user uses `planning.md` as a personal scratchpad / running todo list. Do not overwrite it.
