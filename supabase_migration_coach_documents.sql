-- Coach education documents (uploaded during coach registration)
create table if not exists public.coach_documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  coach_chat_id text not null,
  telegram_file_id text not null,
  telegram_file_unique_id text,
  file_type text not null, -- document | photo
  mime_type text,
  file_name text
);

create index if not exists coach_documents_coach_chat_id_idx on public.coach_documents (coach_chat_id);
create index if not exists coach_documents_created_at_idx on public.coach_documents (created_at desc);
