-- ============================================================
-- ADMIN SETUP — Run AFTER emergency-fix.sql
-- Safe to run — does NOT touch existing working policies
-- ============================================================

-- 1. Add role + status columns (safe, idempotent)
alter table profiles add column if not exists role text default 'user';
alter table profiles add column if not exists status text default 'active';

-- 2. Activity logs table
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  action text not null,
  metadata jsonb default '{}',
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists idx_activity_logs_user    on activity_logs(user_id);
create index if not exists idx_activity_logs_created on activity_logs(created_at desc);

alter table activity_logs enable row level security;
create policy "logs_insert" on activity_logs for insert with check (true);
create policy "logs_select" on activity_logs for select using (true);

-- 3. Set yourself as admin (replace YOUR-USER-ID)
-- update profiles set role = 'admin' where id = 'YOUR-USER-ID-HERE';

-- 4. Realtime for activity_logs
do $$
declare already boolean;
begin
  select exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'activity_logs'
  ) into already;
  if not already then
    alter publication supabase_realtime add table activity_logs;
  end if;
end $$;

-- 5. Verify
select id, username, role, status from profiles limit 5;
