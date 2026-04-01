-- Add oblast (region) to city_list for two-step city search (oblast -> city)
alter table if exists public.city_list
  add column if not exists oblast text;

create index if not exists city_list_oblast_idx on public.city_list (oblast);
create index if not exists city_list_city_name_idx on public.city_list (city_name);
