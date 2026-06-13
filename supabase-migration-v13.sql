-- Migration v13: odemeler.hesap_id backfill from islemler.hesap_id
-- Geçmiş islem kayıtlarındaki hesap bilgisini ödeme satırlarına taşı
UPDATE public.odemeler o
SET hesap_id = i.hesap_id
FROM public.islemler i
WHERE o.islem_id = i.id
  AND o.hesap_id IS NULL
  AND i.hesap_id IS NOT NULL;
