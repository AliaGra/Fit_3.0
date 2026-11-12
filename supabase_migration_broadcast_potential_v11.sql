-- Розсилка потенційним v1.1: клуби / місто / інші міста
-- Date: 2026-11-12
-- Логіка читає наявні users, user_venues, city_list; тут — розширення broadcast_log під нові типи.

ALTER TABLE IF EXISTS public.broadcast_log
  ADD COLUMN IF NOT EXISTS oblast text;

COMMENT ON COLUMN public.broadcast_log.audience_type IS
  'own_all | own_active | own_sleeping | potential (власник) | pot_club | pot_city | pot_other. '
  'pot_club = user_venues клубу без активного coach_id; pot_city/pot_other = учні міста з ads_opt_in. '
  'Напрям pot_other буде платним пізніше.';

COMMENT ON COLUMN public.broadcast_log.oblast IS
  'Область для pot_other (вибір як при реєстрації). Для інших типів — NULL.';

COMMENT ON COLUMN public.broadcast_log.venue_id IS
  'Власник: заклад-відправник. pot_club: цільовий клуб розсилки. Інакше NULL.';

COMMENT ON COLUMN public.broadcast_log.city IS
  'Місто аудиторії (pot_city / pot_other / potential). Для pot_club — місто клубу (опційно).';

-- Індекс під аналітику по типу аудиторії
CREATE INDEX IF NOT EXISTS broadcast_log_audience_created_idx
  ON public.broadcast_log (audience_type, created_at DESC);
