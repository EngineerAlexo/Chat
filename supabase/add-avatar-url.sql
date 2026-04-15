-- Run this in Supabase SQL Editor (one-time migration)
alter table conversations add column if not exists avatar_url text;
