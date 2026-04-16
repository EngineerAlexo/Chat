-- ============================================================
-- EMERGENCY FIX — Run this IMMEDIATELY in Supabase SQL Editor
-- Fixes infinite recursion in profiles policies
-- ============================================================

-- Step 1: Drop ALL broken policies on profiles
do $$ begin
  drop policy if exists "admin_profiles_select" on profiles;
  drop policy if exists "admin_profiles_update" on profiles;
  drop policy if exists "admin_profiles_delete" on profiles;
  drop policy if exists "profiles_select" on profiles;
  drop policy if exists "profiles_insert" on profiles;
  drop policy if exists "profiles_update" on profiles;
exception when others then null;
end $$;

-- Step 2: Recreate safe policies (NO self-reference)
alter table profiles enable row level security;

-- Anyone can read profiles (needed for chat to work)
create policy "profiles_select" on profiles
  for select using (true);

-- Only own profile can be inserted
create policy "profiles_insert" on profiles
  for insert with check (id = auth.uid());

-- Only own profile can be updated (admin update handled via service role)
create policy "profiles_update" on profiles
  for update using (id = auth.uid());

-- Step 3: Add role + status columns safely
alter table profiles add column if not exists role text default 'user';
alter table profiles add column if not exists status text default 'active';

-- Step 4: Verify fix
select count(*) as profile_count from profiles;
