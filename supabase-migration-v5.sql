-- =====================================================
-- Migration v5: islemler tablosuna adam_saat kolonu
-- =====================================================

alter table public.islemler
  add column if not exists adam_saat numeric null;
