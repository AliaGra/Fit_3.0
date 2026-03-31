-- Admin audit log
-- Date: 2026-03-31

create table if not exists public.admin_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  admin_chat_id text not null,
  action text not null,
  target_user_chat_id text,
  target_invite_code text,
  payload_json jsonb
);

create index if not exists admin_log_created_at_idx on public.admin_log (created_at desc);
create index if not exists admin_log_admin_chat_id_idx on public.admin_log (admin_chat_id);

