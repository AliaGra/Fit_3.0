-- Add users.is_blocked flag for admin blocking
-- Date: 2026-03-31

alter table if exists public.users
add column if not exists is_blocked boolean not null default false;

