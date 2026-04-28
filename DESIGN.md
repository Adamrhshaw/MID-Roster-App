# Technical Design Document: Radiology Department Rostering System

## Context

A Radiology Department needs a web-based rostering tool to manage staff across three modalities (X-Ray, Ultrasound, CT) on a 3-shift-per-day, 4-week block cadence. The tool must enforce staffing constraints (FTE limits, certifications, leave), support a drag-and-drop editing UI, and provide a no-auth staff portal for leave/swap submissions. This document covers schema, rules engine, auth portal, generation algorithm, and export — ready for wireframing.

**Stack:** Next.js 15 (App Router), Supabase (PostgreSQL + Auth for managers), custom roster grid (see §7), dnd-kit (drag-and-drop overlay), shadcn/ui (component library), papaparse/xlsx (exports).

**Confirmed shift times (all areas):** Morning 08:00–16:00 | Afternoon 16:00–00:00 | Night 00:00–08:00
**Confirmed FTE hours (from MRS Award 2025):**
- All staff in scope: **35h/week** standard (38h/week staff classifications not relevant for this department)
- Part-time staff supported via `fte_target` (e.g. 0.5 × 35h = 17.5h/week)
- **ADO (Accrued Day Off) accrual:** Each shift includes a **38-minute unpaid break**. Of the 8h roster span, staff are paid for 7h 22min of work. The remaining **22 minutes per day accrues toward an ADO**. After ~19 working days (≈4 weeks), the 22-min/day accrual totals 418 minutes (~7h), which is exchanged for a full paid Accrued Day Off. The roster must track this accrual and schedule the ADO day within (or carry forward to) the block.
  - Effective paid hours per 8h shift = 8h − 38min break = 7h 22min
  - ADO accrual per shift = 22 min (the portion of the break that accrues)
  - ADO threshold ≈ 480 min (8h) — confirm exact threshold if different
**On-call:** Deferred — schema must remain extensible to add on-call shift types later without migration pain.
**Equipment downtime:** Out of scope for MVP. Focus is on creating a correct initial roster.
**XLSX export:** For hospital HR system import only (not in-app review). Single flat sheet, same structure as CSV.
**Staff portal:** No authentication — staff enter Employee ID only. Manager reviews all requests before approving.

---

## 1. Database Schema

### Core Tables

```sql
-- Areas / Modalities
areas (
  id uuid PK,
  name text NOT NULL,               -- 'X-Ray', 'Ultrasound', 'CT'
  min_staff_per_shift int NOT NULL, -- safety minimum
  created_at timestamptz
)

-- Certifications / Skillsets
certifications (
  id uuid PK,
  name text NOT NULL,               -- 'CT-Certified', 'Ultrasound-Accredited'
  required_for_area_id uuid FK areas  -- nullable; some certs are area-specific
)

-- Staff Classification Lookup (from MRS Award 2025)
staff_classifications (
  id uuid PK,
  discipline text NOT NULL,   -- 'diagnostic_radiographer', 'radiation_therapist'
  level int NOT NULL,          -- 1–6
  grade text,                  -- '1', '2', '3', or null
  year int,                    -- 1–5 or null
  standard_weekly_hours numeric(4,1) NOT NULL DEFAULT 35.0
)

-- Staff
staff (
  id uuid PK,
  full_name text NOT NULL,
  employee_id text UNIQUE NOT NULL,   -- hospital HR system ID
  email text UNIQUE NOT NULL,
  phone text,
  classification_id uuid FK staff_classifications,
  fte_target numeric(3,2) NOT NULL,   -- 0.5, 0.8, 1.0
  -- weekly_hours_target derived: fte_target × classification.standard_weekly_hours
  primary_area_id uuid FK areas,
  is_active boolean DEFAULT true,
  created_at timestamptz
)

-- Many-to-many: staff ↔ certifications
staff_certifications (
  staff_id uuid FK staff,
  certification_id uuid FK certifications,
  granted_date date NOT NULL,
  expiry_date date,                 -- nullable for permanent certs
  PRIMARY KEY (staff_id, certification_id)
)

-- Many-to-many: staff ↔ areas they are rostered across
staff_areas (
  staff_id uuid FK staff,
  area_id uuid FK areas,
  is_primary boolean DEFAULT false,
  PRIMARY KEY (staff_id, area_id)
)

-- Shift Templates (the master pattern, area of week independent of year)
shift_templates (
  id uuid PK,
  area_id uuid FK areas,
  shift_type text NOT NULL CHECK (shift_type IN ('morning','afternoon','night','ado')),
  -- 'ado' = Accrued Day Off; replaces a rostered shift, counts as paid non-attendance
  start_time time NOT NULL,         -- morning=08:00, afternoon=16:00, night=00:00
  end_time time NOT NULL,           -- morning=16:00, afternoon=00:00, night=08:00
  duration_hours numeric(4,2) GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600
  ) STORED,  -- 8.0h for all standard shifts (3 × 8h = 24h coverage)
  ado_accrual_minutes int NOT NULL DEFAULT 22,  -- 22 min/shift accrual (38-min break, 22 min accrues toward ADO)
  day_of_week int CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Mon
  required_staff int NOT NULL DEFAULT 1,
  required_certification_id uuid FK certifications  -- nullable
)

-- Roster Blocks (a 4-week scheduling period)
roster_blocks (
  id uuid PK,
  name text,                         -- e.g. 'Block 3 – May 2026'
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text CHECK (status IN ('draft','published','archived')) DEFAULT 'draft',
  generated_at timestamptz,
  published_at timestamptz,
  created_by uuid FK auth.users
)

-- Shift Instances (concrete shifts within a block, generated from templates)
shift_instances (
  id uuid PK,
  roster_block_id uuid FK roster_blocks,
  template_id uuid FK shift_templates,  -- traceability back to template
  area_id uuid FK areas,
  shift_type text NOT NULL,
  shift_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text CHECK (status IN ('open','filled','understaffed')) DEFAULT 'open'
)

-- Assignments (staff → shift_instance)
assignments (
  id uuid PK,
  shift_instance_id uuid FK shift_instances,
  staff_id uuid FK staff,
  status text CHECK (status IN ('confirmed','draft','swapped','cancelled')) DEFAULT 'draft',
  source text CHECK (source IN ('generated','manual','swap')) DEFAULT 'manual',
  created_at timestamptz,
  updated_at timestamptz,
  UNIQUE (shift_instance_id, staff_id)
)

-- Leave Requests
leave_requests (
  id uuid PK,
  staff_id uuid FK staff,
  leave_type text CHECK (leave_type IN (
  'annual',        -- Annual Leave
  'sick',          -- Sick Leave / Personal/Carer's Leave
  'study',         -- Study Leave
  'ado',           -- Accrued Day Off (22 min/day accrual, scheduled by system)
  'rdo',           -- Rostered Day Off
  'long_service',  -- Long Service Leave
  'parental',      -- Parental Leave (maternity/paternity/adoption)
  'bereavement',   -- Bereavement / Compassionate Leave
  'military',      -- Defence Service Leave
  'other'          -- Catch-all for any award-specific leave not listed
)),
  start_date date NOT NULL,
  end_date date NOT NULL,
  notes text,
  status text CHECK (status IN ('pending','approved','rejected','cancelled')) DEFAULT 'pending',
  submitted_via text CHECK (submitted_via IN ('portal','manager')) DEFAULT 'portal',
  token_id uuid FK portal_tokens,  -- which token was used to submit
  reviewed_by uuid FK auth.users,
  created_at timestamptz,
  updated_at timestamptz
)

-- ADO Accrual Tracking
-- 22 min/day accrues. After ~19 working days (≈4 weeks), staff take a full paid ADO day.
-- The roster generator must schedule the ADO day within the block for eligible staff.
ado_accruals (
  id uuid PK,
  staff_id uuid FK staff,
  roster_block_id uuid FK roster_blocks,
  accrual_minutes int NOT NULL DEFAULT 0,    -- running total within this block
  ado_day_date date,                          -- null until ADO is scheduled
  ado_assignment_id uuid FK assignments,      -- the 'ADO' shift assignment
  created_at timestamptz
)

-- Shift Swap Requests
shift_swaps (
  id uuid PK,
  requester_staff_id uuid FK staff,
  requester_assignment_id uuid FK assignments,
  target_staff_id uuid FK staff,         -- nullable if open-market swap
  target_assignment_id uuid FK assignments, -- nullable
  reason text,
  status text CHECK (status IN ('pending','approved','rejected','cancelled')) DEFAULT 'pending',
  token_id uuid FK portal_tokens,
  reviewed_by uuid FK auth.users,
  created_at timestamptz
)
```

### Portal Tokens Table (No-Auth Portal)

```sql
portal_tokens (
  id uuid PK DEFAULT gen_random_uuid(),
  staff_id uuid FK staff NOT NULL,
  token_hash text NOT NULL UNIQUE,  -- SHA-256 of the raw token
  purpose text CHECK (purpose IN ('leave','swap','view')),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,              -- set on first use; null = unused
  created_at timestamptz DEFAULT now()
)
```

### Key Indexes

```sql
CREATE INDEX idx_assignments_shift ON assignments(shift_instance_id);
CREATE INDEX idx_assignments_staff ON assignments(staff_id);
CREATE INDEX idx_leave_requests_staff_dates ON leave_requests(staff_id, start_date, end_date);
CREATE INDEX idx_shift_instances_block_date ON shift_instances(roster_block_id, shift_date);
CREATE INDEX idx_portal_tokens_hash ON portal_tokens(token_hash) WHERE used_at IS NULL;
```

### Multidisciplinary Staff Modelling

- `staff.primary_area_id` is the home area.
- `staff_areas` junction lists all areas a staff member is eligible to work.
- `staff_certifications` controls which shifts they can be assigned (e.g., CT-Certified required for CT shifts).
- The generator and rules engine join through both tables when computing eligibility.

---

## 2. Rules Engine

### Architecture

Rules are pure TypeScript functions with a shared signature, composed into an ordered pipeline:

```typescript
type RuleContext = {
  staff: Staff
  newAssignment: { shiftInstance: ShiftInstance; date: Date }
  existingAssignments: Assignment[]   // staff's assignments in the block
  leaveRequests: LeaveRequest[]
  allAssignments: Assignment[]        // full block, for coverage checks
}

type Violation = {
  ruleId: string
  severity: 'error' | 'warning'
  message: string
  affectedIds?: string[]
}

type Rule = (ctx: RuleContext) => Violation[]
```

Rules live in `/lib/rules/` — one file per rule, exported and assembled in `/lib/rules/index.ts`:

```typescript
export const RULES: Rule[] = [
  minimumRestPeriodRule,     // 10h min between consecutive shifts
  maxWeeklyHoursRule,        // fte_target × 38h per week
  leaveConflictRule,         // no assignment during approved leave
  certificationRequiredRule, // area requires cert staff doesn't hold
  areaCoverageRule,          // shift falls below area.min_staff_per_shift
]
```

Each rule receives only what it needs to compute violations — no side effects.

### Real-Time Drag-and-Drop Integration

**Problem:** Running the full pipeline on every drag-move is too expensive.

**Solution — two-tier validation:**

| Tier | When | What runs | Latency target |
|------|------|-----------|----------------|
| Preview (optimistic) | `onDragOver` (debounced 200ms) | Fast rules only: `leaveConflictRule`, `certificationRequiredRule` | <10ms |
| Full | `onDragEnd` (drop confirmed) | All rules including coverage and weekly hours | <100ms |

Since manual changes are never blocked, `eventAllow` always returns `true`. Instead, use `onDragOver` to show a preview warning badge on the drop target (amber glow if a fast-rule violation is detected), and `eventDrop` to run the full pipeline and display persistent violation chips on the card post-drop.

**dnd-kit integration point (if using custom calendar overlay):** `onDragMove` → debounced tier-1, `onDragEnd` → tier-2 then `useMutation` to persist.

**Incremental evaluation:** Pass only the affected staff's assignments to the rules context, not the entire roster. Full coverage checks use a pre-computed `coverageSummary` map keyed by `(shift_instance_id)` → `assignedCount`, updated in memory on each drop.

### Rule Violation Display

**Important design decision: manual changes are never blocked — only warned.** This matches the operational reality that a rostering manager sometimes needs to override constraints (e.g., emergency cover). The rules engine surfaces issues, but the manager has final authority.

All violations display as **amber warnings** on the shift card after a drop. The manager can acknowledge and proceed, or undo. There are no hard blocks in the UI.

The generator (automated draft creation) does respect rules as hard constraints — it won't assign a staff member who violates a rule. But a human can override any generated assignment post-hoc.

Violation chips show on the assignment card:
- "Leave conflict — [Staff Name] has approved leave on this date"
- "No CT certification — [Staff Name] is not certified for CT"
- "Weekly hours exceeded — [X]h allocated vs [Y]h target"
- "Below minimum staffing — this shift has [N] staff, minimum is [M]"

---

## 3. No-Auth Staff Portal

### Design Decision

Staff enter their **Employee ID** on a public portal page. The app cross-references it against the `staff` table to resolve identity and attach the request. No password, OTP, or link is required. This is acceptable because:
- A manager reviews and approves/rejects every request before it affects the roster.
- The consequence of a spoofed request is a pending leave request — not an automatic roster change.
- The portal is an internal department tool, not a public-facing system.

If spoofing becomes a concern in future, an email OTP layer can be added with no schema changes (just add an OTP step before the form is shown).

### Flow

```
Staff action                    Server action
──────────────────────────────────────────────────────
1. Staff opens /portal
2. Enters Employee ID and submits
                                3. Lookup staff WHERE employee_id = ?
                                   If not found → return "ID not recognised"
                                   If found → store staff_id in a short-lived
                                   signed session cookie (15 min rolling, httpOnly)
                                   Redirect to /portal/home
4. Staff views roster (Calendar or List tab)
                                5. Fetch published shift_instances for current/upcoming blocks
                                   Filter by area if selected
                                   Staff member's own shifts auto-highlighted
6. Staff submits Leave or Swap request (tab form)
                                7. Validate session cookie → extract staff_id
                                8. INSERT into leave_requests or shift_swaps
                                   with status = 'pending', submitted_via = 'portal'
                                9. Show inline confirmation on the tab
                                10. Manager sees new pending request in dashboard
11. Manager approves/rejects
                                12. UPDATE status; apply to roster if approved
                                13. Send notification email to staff.email
```

### Schema Notes

The `portal_tokens` table (from earlier magic-link designs) is **not included** in this design — the Employee ID only approach does not require it. `leave_requests` and `shift_swaps` use `submitted_via = 'portal'` as the audit trail for portal-submitted requests.

### Security Properties

| Risk | Mitigation |
|------|------------|
| Spoofed Employee ID | Manager approves every request; no automatic roster change |
| Submitting on behalf of another staff member | Same as above — manager review is the gate |
| Brute-forcing valid Employee IDs | Rate limit `/portal` to 20 lookups per IP per hour; return identical response for found/not-found to avoid enumeration |
| Session cookie hijacking | httpOnly, Secure, SameSite=Strict; 15-min expiry; reissued on each form page load |
| CSRF | Next.js route handlers with `SameSite=Strict` cookies; add CSRF token if needed |

### Portal Pages (Next.js Routes)

```
/portal               – Employee ID entry form (gateway)
/portal/home          – Tabbed portal home (Calendar | List | Leave | Swap)
                        All tabs require valid session cookie
                        Session cookie refreshed on each navigation (15-min rolling window)
```

Manager dashboard shows all pending requests with one-click approve/reject.

### Swap Approval Notifications

When a manager approves or rejects a shift swap, the requesting staff member must be notified. Since staff have no app login, notification goes to their registered email address.

**Flow:**
1. Manager clicks Approve or Reject on a pending swap in the dashboard.
2. Server updates `shift_swaps.status` and (if approved) updates the relevant `assignments`.
3. Server sends a transactional email to `staff.email` of the requesting staff member.

**Email content (approval):**
> "Your shift swap request for [Date] [Shift Type] has been approved. Your roster has been updated."

**Email content (rejection):**
> "Your shift swap request for [Date] [Shift Type] was not approved. Contact your manager for details."

**Email delivery:** Use [Resend](https://resend.com) or a similar transactional email provider via a Next.js API route / Supabase Edge Function. No email provider is confirmed yet — the sending call should be isolated in `/lib/notifications/sendEmail.ts` so the provider can be swapped without touching business logic.

**Leave request notifications:** Same pattern — staff receive an email when their leave request is approved or rejected.

---

## 4. Roster Generation Algorithm

### Phase 0 — Master Template Definition (in-app configuration)

Before any roster can be generated, a manager defines the **Master Template** via the Settings page (`/settings/templates`). This is a one-time setup (updated only when the department's regular pattern changes).

**What the manager configures:**

For each combination of Area × Day of Week × Shift Type, the manager sets:
- **Shift times** (pre-filled from confirmed defaults: morning 08:00–16:00, etc.)
- **Required staff count** (e.g., CT Morning Monday requires 2 staff)
- **Required certification** (optional — e.g., CT Morning requires ≥1 CT-Certified)
- **Active/Inactive toggle** — e.g., disable night shifts on weekends if not required

**UI for template management (`/settings/templates`):**

```
Master Shift Template

Area: [X-Ray ▼]

         Mon   Tue   Wed   Thu   Fri   Sat   Sun
Morning  [2]   [2]   [2]   [2]   [2]   [1]   [1]    (required staff)
Afternoon[2]   [2]   [2]   [2]   [2]   [1]   [1]
Night    [1]   [1]   [1]   [1]   [1]   [1]   [1]

  ○ = inactive shift   [2] = click to edit count/cert requirement
```

Each cell is clickable to open a popover: edit required_staff count, required_certification_id, and active/inactive status.

**Relationship to generation:**

When a new roster block is created, the generator reads all active `shift_templates` rows and stamps out a concrete `shift_instances` row for every `(template_id, date)` combination across the 4-week span. If the template changes, only future blocks are affected — existing blocks retain their already-generated instances.

---

### Inputs

- `roster_block`: the target 4-week period
- `shift_templates`: active shift template rows
- `approved_leave_requests`: overlapping the block period
- `staff[]`: active staff with FTE targets, areas, and certifications
- `existing_assignments[]`: any manually fixed assignments (e.g., from a previous iteration)

### Phase 1 — Template Expansion

Generate a `shift_instances` row for every `(template, date)` combination in the block. Skip dates where the template's `day_of_week` doesn't match. This is pure date arithmetic — no staff logic yet.

```
for each template T:
  for each date D in [block.start_date, block.end_date]:
    if day_of_week(D) == T.day_of_week:
      INSERT shift_instances (template_id, date, area_id, ...)
```

### Phase 2 — Leave Overlay

For each approved leave request, mark affected assignments as vacant:
- If an existing assignment overlaps the leave period, set `assignments.status = 'cancelled'`.
- Mark the parent `shift_instance.status = 'understaffed'` if cancellation drops coverage below `areas.min_staff_per_shift`.

### Phase 3 — Gap Detection

Query: all `shift_instances` in the block where assigned confirmed staff count < `shift_templates.required_staff`. Return as an ordered list of `gaps`, prioritised:

1. Shifts already below `min_staff_per_shift` (safety critical first)
2. Earlier dates before later dates
3. Night shifts before morning (harder to fill)

### Phase 4 — Greedy Gap Fill

For each gap:

```typescript
const candidates = staff
  .filter(s => s.areas.includes(gap.area_id))
  .filter(s => meetsSkillRequirement(s, gap.required_cert_id))
  .filter(s => !hasLeaveOn(s, gap.shift_date))
  .filter(s => !violatesRestPeriod(s, gap))
  .filter(s => !exceedsFteLimit(s, gap, currentBlock))
  .sort(by: [
    asc(hoursWorkedThisBlock(s)),           // primary: fairness
    asc(s.is_casual),                       // secondary: prefer permanent
    desc(s.classification.level),           // tiebreaker: MRS award level (higher = more senior)
    desc(s.classification.grade ?? 0),      // sub-tiebreaker: grade within level
  ])

if (candidates.length > 0):
  assign candidates[0] to gap
else:
  flag gap as UNRESOLVABLE → surface in "Gaps Report"
```

This is O(gaps × staff) = manageable for 50 staff × ~84 shifts per block.

### Phase 4b — ADO Scheduling

After gap fill, calculate each staff member's ADO entitlement for the block:

```
for each staff member S:
  working_days = count(assignments where S is assigned in this block)
  accrued_minutes = working_days × 22
  ado_days_due = floor(accrued_minutes / 480)  -- ~480 min threshold; confirm exact value
  -- 22 min/shift × 22 shifts ≈ 484 min → 1 ADO day after ~22 working days (~4.5 weeks)

  if ado_days_due >= 1:
    find the best day to schedule the ADO:
      - Must be a day S is rostered (ADO replaces a shift)
      - Prefer days where coverage remains above min_staff_per_shift without S
      - Avoid placing ADO on a shift that would drop area below minimum
    create assignment with shift_type = 'ado', status = 'draft'
    record in ado_accruals table
    re-run areaCoverageRule on affected shifts (may create new gaps to fill)
```

**Key constraint:** ADO days reduce coverage — they must be scheduled on days where the remaining staff satisfy area minimums, or the gap must be filled by another staff member. The generator treats ADO scheduling as part of the gap-fill loop.

### Phase 5 — Output

- All assignments written with `source = 'generated'`, `status = 'draft'`.
- A `GenerationReport` object is returned alongside:
  - `filledCount`, `unresolvableGaps[]`, `warningViolations[]`
- The roster remains in `draft` status until a manager reviews and publishes.
- Managers can then drag-and-drop to fix unresolvable gaps before publishing.

---

## 5. Data Export Strategy

### Export Format

Two formats supported from a single API route handler (`GET /api/export/roster/[blockId]`):

**CSV** (for generic HR/payroll import):

| Column | Value | Notes |
|--------|-------|-------|
| `employee_id` | staff.employee_id | Hospital HR system key |
| `full_name` | staff.full_name | |
| `area` | areas.name | |
| `shift_type` | 'morning' / 'afternoon' / 'night' | |
| `shift_date` | ISO 8601 date | YYYY-MM-DD |
| `start_time` | ISO 8601 time | HH:MM |
| `end_time` | ISO 8601 time | HH:MM |
| `hours` | numeric | Decimal hours |
| `status` | 'confirmed' / 'draft' | |
| `leave_flag` | boolean | True if shift is leave-covered |

**XLSX** (for hospital HR system import — single flat sheet, same structure as CSV):
- One row per assignment; same columns as CSV.
- No multi-sheet formatting. HR software imports flat tabular data.
- Manager review of the roster happens in-app via the calendar UI, not in the spreadsheet.

### Implementation

```typescript
// app/api/export/roster/[blockId]/route.ts
export async function GET(req: Request, { params }) {
  const format = new URL(req.url).searchParams.get('format') ?? 'csv'
  const rows = await fetchRosterRows(params.blockId)  // denormalised query

  if (format === 'xlsx') {
    const wb = buildWorkbook(rows)   // uses xlsx library
    return new Response(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="roster-${params.blockId}.xlsx"`,
      }
    })
  }

  const csv = Papa.unparse(rows, { header: true })
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="roster-${params.blockId}.csv"`,
    }
  })
}
```

**Key compatibility decisions:**
- Always use `YYYY-MM-DD` dates and `HH:MM` times — the two formats hospital systems accept universally.
- Include `employee_id` (not the UUID) as the join key for HR software.
- Avoid special characters in column headers (no slashes, parentheses).
- Export decimal hours (not HH:MM duration) for payroll systems that expect numeric input.

---

## 6. Radiology-Specific Edge Cases

### EC-1: On-Call and Callback Shifts (Deferred — Schema Must Stay Extensible)
**Problem:** On-call may need to be added later. Rules (e.g. rest after callback, callback pay tracking) are not defined yet.
**Schema design for extensibility:** The `shift_type` CHECK constraint should be replaced with a FK to a `shift_types` lookup table, so new types (e.g. `on-call`, `training`) can be added via a data insert rather than a migration. This avoids a schema change when requirements become clear.
```sql
shift_types (id uuid PK, name text UNIQUE, counts_toward_fte boolean DEFAULT true)
-- seed: morning, afternoon, night
```
**Rules engine design:** Rules are registered in an array; on-call rules can be added as new rule files without touching existing rules.

### EC-2: Equipment Downtime / Modality Closure
**Problem:** A CT scanner going for service means CT shifts are unstaffed by necessity — but staff must still be placed somewhere.
**Schema impact:** Add `area_closures` table: `(area_id, start_date, end_date, reason)`.
**Logic impact:** Generator skips CT shift instances during a closure period. Rules engine adds a `closureConflictRule` to flag any assignment to a closed area. UI shows the area as greyed-out on the calendar.

### EC-3: Radiation Dose Rotation (CT-Specific)
**Problem:** CT staff accumulate occupational radiation exposure. Some departments rotate staff off CT after N consecutive weeks to manage dose.
**Schema impact:** Add `staff_rotation_limits` table: `(staff_id, area_id, max_consecutive_weeks, reset_date)`.
**Logic impact:** Generator tracks CT weeks per staff in the current block. Rules engine warns if a staff member exceeds consecutive CT weeks. This constraint is configurable per staff member, not global.

### EC-4: Minimum Skill Mix Per Shift (Not Just Headcount)
**Problem:** Having 3 staff on a morning shift is fine only if at least 1 is CT-certified. Pure headcount coverage checks miss this.
**Schema impact:** Add `shift_skill_requirements` table: `(shift_template_id, certification_id, min_count)` — e.g., "CT morning shift must have ≥1 CT-Certified staff."
**Logic impact:** `areaCoverageRule` must check both total headcount AND per-certification headcount. Generator must fill certification-specific slots first before general slots.

### EC-5b: ADO Accrual and Coverage Cascades
**Problem:** When multiple staff have ADOs due in the same week of a 4-week block, scheduling them simultaneously can drop area coverage below minimum across several shifts.
**Logic:** The generator should schedule ADOs one at a time, in seniority order, re-checking coverage after each placement. If placing an ADO creates an unresolvable gap (no eligible fill candidate), defer the ADO to the next block and carry the accrual forward in `ado_accruals.accrual_minutes`.
**Schema impact:** `ado_accruals.accrual_minutes` persists across blocks as a running carry-forward balance.

### EC-5c: Part-Time Staff and Split Availability
**Problem:** 0.5 FTE staff may only be available certain days (e.g., Mon/Wed/Fri). If the generator ignores this, it creates unworkable rosters.
**Schema impact:** Add `staff_availability` table: `(staff_id, day_of_week, available boolean, notes text)`. Default all days available; mark exceptions.
**Logic impact:** Generator filters candidates by `staff_availability` for the shift's day of week before assigning. Rules engine adds `availabilityRule` to catch manual overrides that violate stated availability.
**ADO note:** Part-time staff accrue 22 min per day worked (not per calendar day), so their ADO entitlement is calculated from actual rostered days, not total days in the block.

---

## 7. Visual Layout & UI Design Plan

> **Note:** This section describes the structural wireframe. Once approved, the visual design (colour, typography, spacing, component polish) can be refined by invoking the `/frontend-design` skill against the implemented components.

### Design Principles
- Clean, clinical aesthetic: neutral background (white/light grey), with a strong primary colour accent for the department (suggest deep blue or teal, aligned to typical hospital palette)
- shadcn/ui components as the foundation; Tailwind CSS for layout
- Responsive but primarily designed for desktop (rostering is a desk task)
- Dense information layout — managers need to see as many shifts as possible without scrolling

### Page Map

```
/                       → Redirect to /roster (or login if not authenticated)
/login                  → Supabase Auth login for managers
/roster                 → Default: current or most recent active block (manager)
/roster/[blockId]       → Main rostering view (calendar, manager)
/roster/[blockId]/generate → Draft generation flow
/staff                  → Staff list + profile management
/staff/[staffId]        → Staff profile, certifications, availability, leave history
/leave                  → Leave requests inbox (all blocks)
/swaps                  → Swap requests inbox (all blocks)
/settings               → Areas, shift templates, certifications config
/settings/templates     → Master template editor

/view                   → Public roster viewer (no auth — staff-facing)
/view/[blockId]         → View a specific block's published roster

/portal                 → Staff-facing: Employee ID entry (gateway)
/portal/home            → Staff portal home (calendar, list, leave, swap tabs)
```

### Public Roster Viewer (`/view` and `/view/[blockId]`)

A publicly accessible read-only page where staff can view published rosters without logging in.

**Features:**
- Shows the current published block by default (`/view` → redirects to current block)
- If an upcoming block has been published, a tab/toggle lets staff switch between "Current" and "Next"
- Full roster is visible to everyone — all staff and all shifts across all areas
- **Staff ID highlight:** A text input at the top of the page accepts an Employee ID. On entry, that staff member's shifts are visually highlighted (coloured outline or bold) while all others are dimmed. This allows a staff member to quickly find their own shifts.
- **No data mutation** — this page is read-only. No login, no session required.

**UI layout:**

```
┌──────────────────────────────────────────────────────────┐
│  Radiology Roster — [Block 3: 5 May–1 Jun 2026]          │
│  [◀ Block 2]   Current ● Next ○              [Block 4 ▶] │
│                                                           │
│  Highlight my shifts: [Enter Employee ID ____]  [Clear]  │
├──────────────────────────────────────────────────────────┤
│  Area: [All ▼]   View: Week / 4-Week                      │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Read-only roster grid (same component as manager) │ │
│  │  Highlighted staff's shifts: bold coloured border  │ │
│  │  Other staff's shifts: normal opacity               │ │
│  │  No drag-and-drop                                   │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

**Security:** Only `published` roster blocks are visible on `/view`. Drafts are never exposed. No staff personal data is shown beyond name and shift time (no FTE, no contact details).

**Linking from portal:** After a staff member enters their Employee ID on `/portal`, include a link: "View your roster →" pointing to `/view?highlight=[employeeId]`. The `highlight` query parameter pre-fills the highlight input on load.

### Manager App — Main Roster View (`/roster/[blockId]`)

```
┌──────────────────────────────────────────────────────────────────────┐
│  [Logo]  Radiology Roster            Block 3: 5 May–1 Jun 2026       │
│  Nav: Roster | Staff | Leave | Swaps | Settings          [J.Morley ▼]│
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ◀ Block 2   [Draft ▼]  [Generate Draft]  [Publish]   ▶ Block 4     │
│  Areas: [All ▼]   Shift: [All ▼]   View: Week / 4-Week               │
│                                                                       │
│ ┌──────────────────────────────────────────┐  ┌─────────────────────┐│
│ │  Custom Roster Grid                      │  │  ⚠ Warnings (4)     ││
│ │  Rows = Staff (grouped by area)          │  │  ─────────────────  ││
│ │  Columns = Days in block                 │  │  ⚠ Leave conflict   ││
│ │  Each cell = up to 3 shift pills         │  │  Smith, J · Mon 5   ││
│ │             (morning / afternoon / night)│  │  Morning · X-Ray    ││
│ │                                          │  │  ─────────────────  ││
│ │  Colour coding:                          │  │  ⚠ No CT cert       ││
│ │   ■ Morning  (blue)                      │  │  Patel, A · Tue 6   ││
│ │   ■ Afternoon (amber)                    │  │  Morning · CT       ││
│ │   ■ Night    (indigo)                    │  │  ─────────────────  ││
│ │   ■ ADO      (green)                     │  │  [View all 4 →]     ││
│ │   □ Open/Gap (red outline)               │  └─────────────────────┘│
│ │                                          │                          │
│ │  Drag pills between cells (dnd-kit)      │                          │
│ │  Click pill → assignment detail popover  │                          │
│ └──────────────────────────────────────────┘                          │
│                                                                       │
│  Coverage bar: X-Ray ████████░░ 4/5   Ultrasound █████░░░ 3/3   CT…  │
└──────────────────────────────────────────────────────────────────────┘
```

**Key UI elements:**
- **Custom roster grid:** HTML table with sticky left column (staff names) and sticky header row (dates). Staff rows grouped by area with a section header. Week-view and 4-week-view toggled by slicing visible columns.
- **Shift pills:** Each cell contains up to three fixed-position pills — morning / afternoon / night — coloured by shift type. Night shifts cross midnight but are modelled as a single pill on the shift's start date (no FullCalendar midnight-crossing complexity).
- **ADO:** Rendered as a full-width green pill in the cell with no time label.
- **Coverage bar:** Fixed summary bar below the grid showing filled vs required per area per visible day range — critical for spotting gaps at a glance.
- **Colour coding by shift type:** Consistent colour per shift type across all views.
- **Open/gap indicators:** Red-outlined empty pill slot where a shift instance has no assignment.
- **Warnings sidebar:** Collapsible panel on the right; badge count shown in the header.

> **Why custom grid instead of FullCalendar:**
> FullCalendar's `resourceTimelineWeek` is a premium plugin requiring a paid licence. The free plugins don't support the resource-row layout needed here. Beyond cost, this app's data shape — exactly three fixed shift types per day rather than variable-duration time-positioned events — fights FullCalendar's rendering model: night shifts cross midnight (awkward in a time-axis view), ADO has no time at all, and the desired cell layout (three stacked pills) can't be achieved without deeply overriding FullCalendar internals. A plain HTML table with dnd-kit overlaid for drag-and-drop gives full control, produces a smaller bundle, and integrates naturally with the existing `@dnd-kit/*` packages already in the project.

### Staff Management View (`/staff`)

```
┌──────────────────────────────────────────────┐
│  Staff   [+ Add Staff]                        │
│  Search: [__________]  Filter: [Area ▼]       │
├──────────────────────────────────────────────┤
│  Name         │ Level │ FTE  │ Areas    │ … │
│  Smith, Jane  │ L3 G1 │ 1.0  │ X-Ray,CT │ ⋮ │
│  Patel, Arjun │ L2 Y3 │ 0.8  │ CT       │ ⋮ │
│  Wong, Ben    │ L4 G1 │ 1.0  │ All      │ ⋮ │
└──────────────────────────────────────────────┘
```

### Leave/Swap Inbox Views (`/leave`, `/swaps`)

Shared layout — a table of pending requests with:
- Staff name, request type, dates, status badge, submitted date
- Action buttons: Approve / Reject (updates status + triggers email)
- Filter tabs: Pending | Approved | Rejected
- Inline notes field for rejection reason

### Staff Portal (`/portal` → `/portal/home`)

The portal is a richer, mobile-friendly interface for staff. No authentication beyond Employee ID entry.

**Entry page (`/portal`):**
```
┌───────────────────────────────┐
│   Radiology Staff Portal      │
│                               │
│   Enter your Employee ID      │
│   [_______________]  [Go →]   │
└───────────────────────────────┘
```

After Employee ID is validated (found in `staff` table), a session cookie is set and the staff member is redirected to `/portal/home`.

**Portal home (`/portal/home`) — tabbed interface:**

```
┌──────────────────────────────────────────────────────┐
│  Radiology Roster              Welcome, Jane Smith    │
│  ─────────────────────────────────────────────────── │
│  [Calendar] [List] [Leave Request] [Shift Swap]       │
├──────────────────────────────────────────────────────┤
│                                                       │
│  TAB: Calendar                                        │
│  ─────────────────────────────────────────────────── │
│  Current block calendar (read-only)                   │
│  Area filter: [All ▼] [X-Ray] [Ultrasound] [CT]       │
│                                                       │
│  Read-only roster grid — same layout as /view but:    │
│  • The logged-in staff member's shifts are highlighted │
│    automatically (no ID entry needed)                 │
│  • Area filter is prominent for browsing colleagues   │
│                                                       │
│  TAB: List                                            │
│  ─────────────────────────────────────────────────── │
│  Flat list of all shifts for the current block        │
│  Grouped by area or by week (toggle)                  │
│  Staff member's own shifts shown with a ● indicator  │
│                                                       │
│  TAB: Request Leave                                   │
│  ─────────────────────────────────────────────────── │
│  Date range picker                                    │
│  Leave type dropdown (annual, sick, RDO, etc.)        │
│  Notes (optional)                                     │
│  [Submit Request]                                     │
│  → Confirmation message; email sent to staff when    │
│    manager approves/rejects                           │
│                                                       │
│  TAB: Shift Swap                                      │
│  ─────────────────────────────────────────────────── │
│  "Your upcoming shifts" — select the shift to swap   │
│  Swap partner name (free text — agreed out-of-app)   │
│  Swap partner's shift date (for manager context)      │
│  Notes (optional)                                     │
│  [Submit Swap Request]                                │
│  → Confirmation message; email sent when resolved     │
└──────────────────────────────────────────────────────┘
```

**Session management:** The 15-min session cookie is refreshed on each tab navigation within the portal so staff are not logged out mid-session. The session encodes `staff_id` only — the server uses this to scope all data fetches and form submissions.

**Data shown in portal:** Only published roster blocks are visible. Drafts are hidden from staff.

### Component Strategy (shadcn/ui)

| Component need | shadcn component |
|---------------|-----------------|
| Data tables (staff, leave, swaps) | `DataTable` (with `@tanstack/react-table`) |
| Modals / confirmations | `Dialog` |
| Form inputs | `Input`, `Select`, `DatePicker` (Radix + `date-fns`) |
| Status badges | `Badge` (with variant colours) |
| Warnings sidebar | `Sheet` (slide-over drawer) |
| Assignment popover | `Popover` |
| Coverage bar | Custom component using `Progress` |
| Toast notifications | `Sonner` |
| Navigation | `NavigationMenu` + `Breadcrumb` |

### Colour Palette (Tailwind)

| Element | Colour |
|---------|--------|
| Primary accent | `blue-700` (or configurable via CSS variable) |
| Morning shift | `sky-100` / `sky-600` text |
| Afternoon shift | `amber-100` / `amber-600` text |
| Night shift | `violet-100` / `violet-600` text |
| ADO | `emerald-100` / `emerald-600` text |
| Open/gap | `red-50` border-dashed `red-400` |
| Warning badge | `amber-500` |
| Background | `gray-50` |
| Card/panel | `white` |

---

## 8. Warnings Panel (Roster Notification System)

Since no changes are ever blocked, the UI needs a persistent, scannable warnings panel so managers can see all rule violations across the entire roster at a glance — not just on individual shift cards.

### Data Model

```typescript
type RosterWarning = {
  id: string                     // stable ID for dismissal tracking
  ruleId: string                 // e.g. 'leaveConflict', 'certificationRequired'
  severity: 'warning'            // all manual violations are warnings (no errors)
  staffId: string
  staffName: string
  shiftInstanceId: string
  shiftDate: string
  message: string                // human-readable description
  autoResolved: boolean          // true once the underlying condition is fixed
}
```

Warnings are **not persisted in the database** — they are computed on demand by running the full rules pipeline against the current roster state. They are stored in React state (or a lightweight client-side store like Zustand) and recalculated after every drop event or page load.

### UI Components

```
┌─────────────────────────────────────────────────────────────┐
│  Roster: Block 3 – May 2026      [Draft]     ⚠ 4 warnings  │
│  ──────────────────────────────────────────────────────────  │
│  Calendar View                    │  ⚠ Warnings Panel       │
│                                   │  ─────────────────────  │
│  [Custom roster grid]             │  ⚠ Leave conflict        │
│  Each assignment shows amber dot  │    Smith, J – Mon 5 May  │
│  if it has an active warning      │    Morning | X-Ray       │
│                                   │  ─────────────────────  │
│                                   │  ⚠ No CT certification   │
│                                   │    Patel, A – Tue 6 May  │
│                                   │    Morning | CT          │
│                                   │  ─────────────────────  │
│                                   │  ⚠ Weekly hours exceeded │
│                                   │    Wong, B – Week of...  │
│                                   │  [View all 4 warnings]   │
└─────────────────────────────────────────────────────────────┘
```

### Behaviour

- **On load:** Run full rules pipeline → populate warnings state.
- **On drag-and-drop (drop event):** Re-run pipeline for affected staff → merge into warnings state (add new, remove auto-resolved).
- **Warning badge on calendar event:** Amber dot indicator on any assignment card with an active warning. Clicking the card opens a popover listing that assignment's warnings.
- **Warnings panel (sidebar or drawer):** Lists all active warnings across the roster, sorted by date. Clicking a warning highlights the corresponding shift on the calendar.
- **Auto-resolution:** If a manager fixes a violation (e.g., removes the conflicting assignment), the warning disappears on the next pipeline run without requiring manual dismissal.
- **Export with warnings flag:** The CSV/XLSX export includes a `has_warning` boolean column so managers can filter flagged rows in the HR system.

### Performance

The warnings pipeline runs entirely client-side against the data already loaded for the calendar view. For a 4-week block with ~50 staff × ~84 shifts, this is ~4,200 assignment checks — well within synchronous execution budget (<50ms). No additional API calls needed post-load.

---

## 9. File Structure (for Reference)

```
/app
  /api
    /export/roster/[blockId]/route.ts
    /portal/route.ts
    /portal/leave/route.ts
    /portal/swap/route.ts
    /roster/[blockId]/generate/route.ts
  /roster/[blockId]/page.tsx        -- manager calendar view
  /portal/page.tsx                  -- staff token landing
  /portal/leave/page.tsx
/lib
  /db/                              -- Supabase query helpers
  /rules/                           -- rules engine
    index.ts
    minimumRestPeriod.ts
    maxWeeklyHours.ts
    leaveConflict.ts
    certificationRequired.ts
    areaCoverage.ts
    availability.ts
  /warnings/
    computeWarnings.ts             -- runs full pipeline, returns RosterWarning[]
    warningsStore.ts               -- Zustand store for client-side warnings state
  /generator/
    expandTemplates.ts
    leaveOverlay.ts
    detectGaps.ts
    fillGaps.ts
    index.ts
  /export/
    buildWorkbook.ts
    buildCsv.ts
  /notifications/
    sendEmail.ts               -- provider-agnostic email sending (swap/leave approved/rejected)
/supabase
  /migrations/
    001_initial_schema.sql
```

---

## 10. Verification Checklist

### Confirmed
- [x] Shift times: Morning 08:00–16:00, Afternoon 16:00–00:00, Night 00:00–08:00 (all areas)
- [x] FTE standard: 38h/week; part-time staff use fractional `fte_target`
- [x] Equipment downtime: out of scope for MVP
- [x] XLSX export: flat single sheet for HR system import; in-app calendar is the review tool
- [x] Staff portal: Employee ID only, no authentication; manager approves all requests

### Still to confirm before wireframing
- [ ] `min_staff_per_shift` per area (X-Ray, Ultrasound, CT separately)
- [ ] All rule violations are warnings only — confirmed. No hard blocks on manual changes.
- [ ] On-call: schema is extensible via `shift_types` lookup table; confirm when needed
- [ ] Which hospital HR system receives the export and column requirements — to confirm during development
- [x] Leave types confirmed: annual, sick, study, ADO, RDO, long service, parental, bereavement, military, other
- [x] ADO carry-forward: confirmed yes — entitlement carries forward if unschedulable, tracked in `ado_accruals.accrual_minutes`
- [x] Shift swaps: both parties are assumed to have already agreed; manager approval is the only formal gate. No in-app counter-party confirmation flow needed in MVP.
