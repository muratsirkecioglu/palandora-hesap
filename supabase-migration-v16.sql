-- Migration v16: malzemeler.miktar ve kaynak_islem_id kaldırıldı
-- Stok artık islem_stok tablosundan dinamik hesaplanıyor

-- 1. Mevcut malzeme alımlarından giris kaydı oluştur
INSERT INTO public.islem_stok (islem_id, malzeme_id, miktar, tur, birim_fiyat)
SELECT
  m.kaynak_islem_id,
  m.id,
  m.miktar,
  'giris',
  CASE WHEN m.miktar > 0
    THEN ROUND(
      COALESCE(
        (SELECT i.tutar - COALESCE(i.nakliye_tutari, 0)
         FROM public.islemler i WHERE i.id = m.kaynak_islem_id),
        0
      ) / m.miktar,
      4
    )
    ELSE 0
  END
FROM public.malzemeler m
WHERE m.kaynak_islem_id IS NOT NULL
  AND m.miktar > 0
  AND NOT EXISTS (
    SELECT 1 FROM public.islem_stok s
    WHERE s.malzeme_id = m.id AND s.tur = 'giris'
  );

-- 2. Artık gereksiz kolonları kaldır
ALTER TABLE public.malzemeler DROP COLUMN IF EXISTS miktar;
ALTER TABLE public.malzemeler DROP COLUMN IF EXISTS kaynak_islem_id;
