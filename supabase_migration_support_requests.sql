-- Support requests from FitHad_helpbot (help/support bot)
-- Stores user tickets, thread messages, and operator actions.

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  status text not null default 'open', -- open | closed
  topic text not null, -- invite | consult | problem | delete_data

  user_chat_id text not null,
  user_role text,

  operator_chat_id text,
  closed_at timestamptz,

  last_user_message text,
  last_operator_message text,

  tech_json jsonb,   -- chat_id, role, bot_state.step, etc.
  thread_json jsonb  -- array of {from, text, at}
);

create index if not exists support_requests_created_at_idx on public.support_requests (created_at desc);
create index if not exists support_requests_status_idx on public.support_requests (status);
create index if not exists support_requests_user_chat_id_idx on public.support_requests (user_chat_id);
