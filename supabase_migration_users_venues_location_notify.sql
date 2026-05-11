-- FIT 3.0: область + район для адреси користувача та закладу (сповіщення про нові заклади)
-- Застосувати в Supabase після існуючих міграцій users / venues.

alter table if exists public.users
  add column if not exists oblast text,
  add column if not exists district text;

comment on column public.users.oblast is 'Область (як у city_list / закладі), для таргетованих сповіщень';
comment on column public.users.district is 'Район у межах НП (опційно), для сповіщень разом із закладом';

alter table if exists public.venues
  add column if not exists district text;

comment on column public.venues.district is 'Район у межах НП (опційно); якщо порожньо — сповіщення всім у місті/області';

create index if not exists users_oblast_city_idx on public.users (oblast, city)
  where chat_id not like 'INVITE_%';
