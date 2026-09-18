-- Migration v32: Grup = tek bir giriş partisi
--
-- Grup artık serbest bir etiket değil; bir demirbaş girişinin kendisi.
-- Grubu düzenlemek o partiyi yeniden düzenlemek demektir: ortak alanlar
-- üyelere yazılır, adet fazlaysa kayıt silinir, eksikse kayıt eklenir.
--
-- ayri_kayit: parti "her birini ayrı kaydet" ile mi oluşturuldu?
--   true  → parti N ayrı kayıttan oluşur (adet = kayıt sayısı)
--   false → parti tek kayıttır, adedi o kaydın adet alanındadır
-- Düzenlemede adedin neye göre eşitleneceğini bu belirler.

ALTER TABLE public.demirbas_gruplari
  ADD COLUMN IF NOT EXISTS ayri_kayit boolean NOT NULL DEFAULT false;

-- Mevcut grupları gerçek durumlarına göre işaretle: birden fazla kaydı olan
-- ya da tek kaydı adet=1 olan gruplar ayrı kayıtlı sayılır.
UPDATE public.demirbas_gruplari g
SET ayri_kayit = true
WHERE (SELECT count(*) FROM public.demirbaslar d WHERE d.grup_id = g.id) > 1;
