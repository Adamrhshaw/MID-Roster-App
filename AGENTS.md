# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

## Next.js 16 Compliance

- **No `src/middleware.ts`** — use `src/proxy.ts` with a named `proxy` export.
- **Async request APIs** — `cookies()`, `headers()`, and `params` in Page/Layout are strictly async. Always `await params`.
- Prefer `next dev --turbopack`. Avoid Webpack-specific config.
- Run `node node_modules/typescript/lib/tsc.js --noEmit` after structural changes (`tsc` binary is broken).

## shadcn/ui v4 + Base UI

- **No `asChild` prop** — Base UI replaced Radix. Use the `render` prop for all polymorphic components:
  ```tsx
  // Correct:
  <Dialog.Trigger render={<Button>Click me</Button>} />
  // Wrong:
  <Dialog.Trigger asChild>...</Dialog.Trigger>
  ```
- **CLI only** — never manually create component files shadcn can generate. Always run `npx shadcn@latest add <component>`.
- If unsure about a component's structure, read `src/components/ui/<component>.tsx` before extending it.

## MRS Award 2025 — Rostering Rules

- **35-hour week** — Diagnostic Radiographers work a 35h standard week (not 38h).
- **ADO accrual** — 8h shifts rostered, 7h paid. 38 min = unpaid meal break. 22 min accrues toward ADO. 480 min accrued = 1 ADO day. Carry-forward tracked in `ado_accruals`.
- **Rest periods** — minimum 10 hours between rostered shifts.
- **Shift penalties** — Saturday 1.5x, Sunday 2.0x, Public Holiday 2.5x.
- **Warnings only** — all rule violations are flags, never hard blocks. Manager has final authority.
- **No pay classifications** — ignore Grade 1/2/3 levels; only shift coverage and hours matter.
- Before validating a roster block, check `ado_accruals.carry_forward`. Rule violation objects must match `src/types/database.ts`.

## UI Implementation

- Icons: Lucide React.
- Data fetching in `(manager)` routes: use the Supabase SSR client.
- Form submissions: use Server Actions.
- Before building anything, check `TRACKER.md` to avoid duplicating completed work.
