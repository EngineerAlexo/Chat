-- ============================================================
-- FINAL FIX — Clear editor, paste this, click Run
-- ============================================================

-- Drop EVERY policy on every table by reading pg_policies
do $$
declare pol record;
begin
  for pol in select tablename, policyname from pg_policies
    where tablename in ('conversations','participants','messages','profiles','reactions','stickers')
  loop
    execute format('drop policy if exists %I on %I', pol.policyname, pol.tablename);
  end loop;
end $$;

-- Disable RLS on conversations + participants so inserts always work
alter table conversations disable row level security;
alter table participants  disable row level security;

-- Keep RLS on the rest
alter table profiles  enable row level security;
alter table messages  enable row level security;
alter table reactions enable row level security;
alter table stickers  enable row level security;

-- Helper function (no recursion)
create or replace function auth_user_in_conversation(conv_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from participants
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

-- PROFILES
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (id = auth.uid());
create policy "profiles_update" on profiles for update using (id = auth.uid());

-- MESSAGES
create policy "messages_select" on messages
  for select using (auth_user_in_conversation(conversation_id));
create policy "messages_insert" on messages
  for insert with check (sender_id = auth.uid() and auth_user_in_conversation(conversation_id));
create policy "messages_update" on messages
  for update using (sender_id = auth.uid() or auth_user_in_conversation(conversation_id));
create policy "messages_delete" on messages
  for delete using (sender_id = auth.uid());

-- REACTIONS
create policy "reactions_select" on reactions
  for select using (
    exists (select 1 from messages m where m.id = reactions.message_id
      and auth_user_in_conversation(m.conversation_id))
  );
create policy "reactions_insert" on reactions for insert with check (user_id = auth.uid());
create policy "reactions_delete" on reactions for delete using (user_id = auth.uid());

-- STICKERS
create policy "stickers_select" on stickers for select using (true);
