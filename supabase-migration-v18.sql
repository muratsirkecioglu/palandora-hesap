-- Migration v18: islemler tablosuna bagli_gelir_islem_id kolonu ekle
-- Hizmet tipi gider işlemleri, ilgili gelir işlemiyle ilişkilendirilebilir

ALTER TABLE public.islemler
  ADD COLUMN IF NOT EXISTS bagli_gelir_islem_id UUID
    REFERENCES public.islemler(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_islemler_bagli_gelir_islem_id
  ON public.islemler(bagli_gelir_islem_id)
  WHERE bagli_gelir_islem_id IS NOT NULL;
