-- ============================================================
-- TELEGRAM CLONE — FULL DATABASE SCHEMA
-- Run this in your Supabase SQL Editor
-- ============================================================

-- PROFILES
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_url text,
  bio text,
  last_seen timestamptz,
  online_status boolean default false,
  created_at timestamptz default now()
);

-- CONVERSATIONS
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  name text,
  type text check (type in ('private','group','channel','saved')) not null,
  created_at timestamptz default now()
);

-- PARTICIPANTS
create table if not exists participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  role text default 'member' check (role in ('owner','admin','member')),
  unique(conversation_id, user_id)
);

-- MESSAGES
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  sender_id uuid references profiles(id) on delete set null,
  content text,
  media_url text,
  media_type text check (media_type in ('image','video','audio','voice','file','sticker','gif')),
  reply_to_id uuid references messages(id) on delete set null,
  forwarded_from uuid references messages(id) on delete set null,
  is_edited boolean default false,
  deleted_for uuid[] default '{}',
  created_at timestamptz default now()
);

-- REACTIONS
create table if not exists reactions (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  emoji text not null,
  unique(message_id, user_id, emoji)
);

-- STICKERS
create table if not exists stickers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text not null,
  pack_id text not null
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_messages_conv_created on messages(conversation_id, created_at desc);
create index if not exists idx_participants_user on participants(user_id);
create index if not exists idx_participants_conv on participants(conversation_id);
create index if not exists idx_reactions_message on reactions(message_id);
create index if not exists idx_messages_sender on messages(sender_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- PROFILES
alter table profiles enable row level security;
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (id = auth.uid());
create policy "profiles_update" on profiles for update using (id = auth.uid());

-- CONVERSATIONS
alter table conversations enable row level security;
create policy "conversations_select" on conversations for select using (
  id in (select conversation_id from participants where user_id = auth.uid())
);
create policy "conversations_insert" on conversations for insert with check (true);

-- PARTICIPANTS
alter table participants enable row level security;
create policy "participants_select" on participants for select using (
  conversation_id in (select conversation_id from participants where user_id = auth.uid())
);
create policy "participants_insert" on participants for insert with check (true);
create policy "participants_delete" on participants for delete using (user_id = auth.uid());

-- MESSAGES
alter table messages enable row level security;
create policy "messages_select" on messages for select using (
  conversation_id in (select conversation_id from participants where user_id = auth.uid())
);
create policy "messages_insert" on messages for insert with check (
  sender_id = auth.uid() and
  conversation_id in (select conversation_id from participants where user_id = auth.uid())
);
create policy "messages_update" on messages for update using (
  sender_id = auth.uid() or
  conversation_id in (select conversation_id from participants where user_id = auth.uid())
);
create policy "messages_delete" on messages for delete using (sender_id = auth.uid());

-- REACTIONS
alter table reactions enable row level security;
create policy "reactions_select" on reactions for select using (
  message_id in (
    select m.id from messages m
    join participants p on p.conversation_id = m.conversation_id
    where p.user_id = auth.uid()
  )
);
create policy "reactions_insert" on reactions for insert with check (user_id = auth.uid());
create policy "reactions_delete" on reactions for delete using (user_id = auth.uid());

-- STICKERS
alter table stickers enable row level security;
create policy "stickers_select" on stickers for select using (true);

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
-- Run these in Supabase Dashboard > Storage > New Bucket
-- OR via SQL:

insert into storage.buckets (id, name, public) values ('media', 'media', true) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true) on conflict do nothing;

-- Storage policies
create policy "media_upload" on storage.objects for insert with check (bucket_id = 'media' and auth.role() = 'authenticated');
create policy "media_select" on storage.objects for select using (bucket_id = 'media');
create policy "avatars_upload" on storage.objects for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy "avatars_select" on storage.objects for select using (bucket_id = 'avatars');

-- ============================================================
-- REALTIME
-- ============================================================
-- Enable realtime for these tables in Supabase Dashboard > Database > Replication
-- OR:
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table reactions;
alter publication supabase_realtime add table profiles;

-- ============================================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, avatar_url)
  values (
    new.id,
    split_part(new.email, '@', 1),
    'https://api.dicebear.com/7.x/avataaars/svg?seed=' || new.id
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
