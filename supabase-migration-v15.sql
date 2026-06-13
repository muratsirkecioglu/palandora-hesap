-- Migration v15: odened_tutar kolonu kaldırıldı — tutar artık odemeler tablosundan hesaplanıyor

-- Eksik odemeler kaydı oluştur: odened_tutar > 0 ama odemeler satırı olmayanlar
INSERT INTO public.odemeler (islem_id, tarih, tutar, hesap_id, kullanici_id)
SELECT i.id, i.tarih, i.odened_tutar, i.hesap_id, i.kullanici_id
FROM public.islemler i
WHERE i.odened_tutar > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.odemeler o WHERE o.islem_id = i.id
  );

-- Trigger ve fonksiyonu kaldır (odemed_tutar ve odeme_durumu ikisi de artık yok)
DROP TRIGGER IF EXISTS odemeler_sync ON public.odemeler;
DROP FUNCTION IF EXISTS public.sync_odened_tutar();

-- odened_tutar kolonunu kaldır
ALTER TABLE public.islemler DROP COLUMN IF EXISTS odened_tutar;
