-- Migration v12: islemler tablosuna nakliye_faturali eklendi
ALTER TABLE public.islemler
  ADD COLUMN IF NOT EXISTS nakliye_faturali BOOLEAN NOT NULL DEFAULT false;
