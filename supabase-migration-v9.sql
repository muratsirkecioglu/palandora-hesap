-- =====================================================
-- Migration v9: Hesaplar arası transfer desteği
-- =====================================================
-- transfer_eslesme_id: iki işlemi (kaynak gider + hedef gelir)
-- aynı transfer çifti olarak eşleştirir
-- =====================================================

ALTER TABLE public.islemler
  ADD COLUMN IF NOT EXISTS transfer_eslesme_id UUID NULL;
