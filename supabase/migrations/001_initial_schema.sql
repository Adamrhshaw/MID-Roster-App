-- ============================================================
-- Radiology Rostering System — Initial Schema
-- MRS Award 2025 (NSW Health)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- LOOKUP TABLES
-- ============================================================

create table areas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  min_staff_per_shift int not null default 1,
  created_at timestamptz not null default now()
);

-- ============================================================
-- STAFF
-- ============================================================

create table staff (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  employee_id text unique not null,
  email text unique not null,
  phone text,
  fte_target numeric(3,2) not null default 1.0 check (fte_target > 0 and fte_target <= 1),
  primary_area_id uuid references areas(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table staff_areas (
  staff_id uuid not null references staff(id) on delete cascade,
  area_id uuid not null references areas(id) on delete cascade,
  is_primary boolean not null default false,
  primary key (staff_id, area_id)
);

create table staff_availability (
  staff_id uuid not null references staff(id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  available boolean not null default true,
  notes text,
  primary key (staff_id, day_of_week)
);

-- ============================================================
-- SHIFT TEMPLATES (master pattern)
-- ============================================================

create table shift_templates (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references areas(id) on delete cascade,
  shift_type text not null check (shift_type in ('morning', 'afternoon', 'night', 'ado')),
  start_time time not null,
  end_time time not null,
  -- 22 min per shift accrues toward ADO (38-min break, 22 min accrues)
  ado_accrual_minutes int not null default 22,
  day_of_week int not null check (day_of_week between 0 and 6),
  required_staff int not null default 1 check (required_staff > 0),
  is_active boolean not null default true
);

-- ============================================================
-- ROSTER BLOCKS
-- ============================================================

create table roster_blocks (
  id uuid primary key default gen_random_uuid(),
  name text,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  generated_at timestamptz,
  published_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  constraint valid_date_range check (end_date > start_date)
);

-- ============================================================
-- SHIFT INSTANCES (concrete shifts within a block)
-- ============================================================

create table shift_instances (
  id uuid primary key default gen_random_uuid(),
  roster_block_id uuid not null references roster_blocks(id) on delete cascade,
  template_id uuid references shift_templates(id) on delete set null,
  area_id uuid not null references areas(id) on delete restrict,
  shift_type text not null check (shift_type in ('morning', 'afternoon', 'night', 'ado')),
  shift_date date not null,
  start_time time not null,
  end_time time not null,
  status text not null default 'open' check (status in ('open', 'filled', 'understaffed'))
);

-- ============================================================
-- ASSIGNMENTS
-- ============================================================

create table assignments (
  id uuid primary key default gen_random_uuid(),
  shift_instance_id uuid not null references shift_instances(id) on delete cascade,
  staff_id uuid not null references staff(id) on delete cascade,
  status text not null default 'draft' check (status in ('confirmed', 'draft', 'swapped', 'cancelled')),
  source text not null default 'manual' check (source in ('generated', 'manual', 'swap')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_instance_id, staff_id)
);

-- ============================================================
-- LEAVE REQUESTS
-- ============================================================

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  leave_type text not null check (leave_type in (
    'annual', 'sick', 'study', 'ado', 'rdo', 'long_service',
    'parental', 'bereavement', 'military', 'other'
  )),
  start_date date not null,
  end_date date not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  submitted_via text not null default 'portal' check (submitted_via in ('portal', 'manager')),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_leave_dates check (end_date >= start_date)
);

-- ============================================================
-- SHIFT SWAPS
-- ============================================================

create table shift_swaps (
  id uuid primary key default gen_random_uuid(),
  requester_staff_id uuid not null references staff(id) on delete cascade,
  requester_assignment_id uuid not null references assignments(id) on delete cascade,
  target_staff_id uuid references staff(id) on delete set null,
  target_assignment_id uuid references assignments(id) on delete set null,
  reason text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ============================================================
-- ADO ACCRUALS
-- ============================================================

create table ado_accruals (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff(id) on delete cascade,
  roster_block_id uuid not null references roster_blocks(id) on delete cascade,
  -- Running total across all blocks (carry-forward)
  accrual_minutes int not null default 0 check (accrual_minutes >= 0),
  ado_day_date date,
  ado_assignment_id uuid references assignments(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (staff_id, roster_block_id)
);

-- ============================================================
-- INDEXES
-- ============================================================

create index idx_assignments_shift on assignments(shift_instance_id);
create index idx_assignments_staff on assignments(staff_id);
create index idx_assignments_status on assignments(status);
create index idx_leave_requests_staff_dates on leave_requests(staff_id, start_date, end_date);
create index idx_leave_requests_status on leave_requests(status);
create index idx_shift_instances_block_date on shift_instances(roster_block_id, shift_date);
create index idx_shift_instances_area on shift_instances(area_id);
create index idx_roster_blocks_status on roster_blocks(status);
create index idx_staff_employee_id on staff(employee_id);
create index idx_shift_swaps_status on shift_swaps(status);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger assignments_updated_at
  before update on assignments
  for each row execute function update_updated_at();

create trigger leave_requests_updated_at
  before update on leave_requests
  for each row execute function update_updated_at();

-- ============================================================
-- SEED DATA
-- ============================================================

-- Default areas
insert into areas (name, min_staff_per_shift) values
  ('X-Ray', 1),
  ('Ultrasound', 1),
  ('CT', 1);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table areas enable row level security;
alter table staff enable row level security;
alter table staff_areas enable row level security;
alter table staff_availability enable row level security;
alter table shift_templates enable row level security;
alter table roster_blocks enable row level security;
alter table shift_instances enable row level security;
alter table assignments enable row level security;
alter table leave_requests enable row level security;
alter table shift_swaps enable row level security;
alter table ado_accruals enable row level security;

-- Authenticated users (managers) have full access to everything
create policy "managers_all" on areas for all to authenticated using (true) with check (true);
create policy "managers_all" on staff for all to authenticated using (true) with check (true);
create policy "managers_all" on staff_areas for all to authenticated using (true) with check (true);
create policy "managers_all" on staff_availability for all to authenticated using (true) with check (true);
create policy "managers_all" on shift_templates for all to authenticated using (true) with check (true);
create policy "managers_all" on roster_blocks for all to authenticated using (true) with check (true);
create policy "managers_all" on shift_instances for all to authenticated using (true) with check (true);
create policy "managers_all" on assignments for all to authenticated using (true) with check (true);
create policy "managers_all" on leave_requests for all to authenticated using (true) with check (true);
create policy "managers_all" on shift_swaps for all to authenticated using (true) with check (true);
create policy "managers_all" on ado_accruals for all to authenticated using (true) with check (true);

-- Public (anon) read access for the /view page — published blocks only
create policy "public_read_published_blocks" on roster_blocks
  for select to anon using (status = 'published');

create policy "public_read_published_shifts" on shift_instances
  for select to anon using (
    exists (
      select 1 from roster_blocks rb
      where rb.id = shift_instances.roster_block_id
      and rb.status = 'published'
    )
  );

create policy "public_read_published_assignments" on assignments
  for select to anon using (
    exists (
      select 1 from shift_instances si
      join roster_blocks rb on rb.id = si.roster_block_id
      where si.id = assignments.shift_instance_id
      and rb.status = 'published'
    )
  );

-- Staff names/areas are readable publicly (shown on the /view roster)
create policy "public_read_active_staff" on staff
  for select to anon using (is_active = true);

create policy "public_read_areas" on areas
  for select to anon using (true);
