-- ============================================================
-- ADMIN DASHBOARD SETUP — Run in Supabase SQL Editor
-- ============================================================

-- 1. Add role column to profiles
alter table profiles add column if not exists role text default 'user'
  check (role in ('user', 'admin', 'moderator'));

-- 2. Add status column to profiles
alter table profiles add column if not exists status text default 'active'
  check (status in ('active', 'suspended', 'banned'));

-- 3. Activity logs table
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade,
  action text not null,
  metadata jsonb default '{}',
  ip_address text,
  created_at timestamptz default now()
);

create index if not exists idx_activity_logs_user on activity_logs(user_id);
create index if not exists idx_activity_logs_created on activity_logs(created_at desc);
create index if not exists idx_activity_logs_action on activity_logs(action);

-- 4. RLS for activity_logs
alter table activity_logs enable row level security;

-- Admins can read all logs
create policy "admin_read_logs" on activity_logs
  for select using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- System can insert logs
create policy "insert_logs" on activity_logs
  for insert with check (true);

-- 5. Admin can read all profiles
drop policy if exists "admin_profiles_select" on profiles;
create policy "admin_profiles_select" on profiles
  for select using (
    id = auth.uid() or
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Admin can update any profile
drop policy if exists "admin_profiles_update" on profiles;
create policy "admin_profiles_update" on profiles
  for update using (
    id = auth.uid() or
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Admin can delete profiles
create policy "admin_profiles_delete" on profiles
  for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- 6. Admin can read all messages
drop policy if exists "admin_messages_select" on messages;
create policy "admin_messages_select" on messages
  for select using (
    auth_user_in_conversation(conversation_id) or
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- Admin can delete any message
drop policy if exists "admin_messages_delete" on messages;
create policy "admin_messages_delete" on messages
  for delete using (
    sender_id = auth.uid() or
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- 7. Admin can read all conversations
drop policy if exists "admin_conversations_select" on conversations;
create policy "admin_conversations_select" on conversations
  for select using (
    auth_user_in_conversation(id) or
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- 8. Set yourself as admin (replace with your user ID)
-- update profiles set role = 'admin' where id = 'YOUR-USER-ID-HERE';

-- 9. Realtime for activity_logs
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
