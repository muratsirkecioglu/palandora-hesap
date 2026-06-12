-- =====================================================
-- Migration v7: Maliyet alanları malzemeler → islemler
-- =====================================================
-- faturali, nakliye_tutari → islemler tablosuna taşınır
-- birim_fiyat, alis_tarihi  → malzemeler'den kaldırılır
-- birim_fiyat artık çalışma zamanında hesaplanır:
--   (islem.tutar - islem.nakliye_tutari) / malzeme.miktar
-- =====================================================

-- 1. islemler tablosuna yeni alanlar ekle
ALTER TABLE public.islemler
  ADD COLUMN IF NOT EXISTS nakliye_tutari NUMERIC        NULL,
  ADD COLUMN IF NOT EXISTS faturali       BOOLEAN NOT NULL DEFAULT true;

-- 2. Mevcut bağlı kayıtların verisini islemler'e taşı
UPDATE public.islemler i
SET
  nakliye_tutari = m.nakliye_tutari,
  faturali       = m.faturali
FROM public.malzemeler m
WHERE m.kaynak_islem_id = i.id;

-- 3. malzemeler'den gereksiz alanları kaldır
ALTER TABLE public.malzemeler
  DROP COLUMN IF EXISTS birim_fiyat,
  DROP COLUMN IF EXISTS faturali,
  DROP COLUMN IF EXISTS nakliye_tutari,
  DROP COLUMN IF EXISTS alis_tarihi;
