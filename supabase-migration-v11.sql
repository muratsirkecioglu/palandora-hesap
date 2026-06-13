-- Migration v11: odemeler tablosuna hesap_id eklendi
ALTER TABLE public.odemeler
  ADD COLUMN IF NOT EXISTS hesap_id UUID REFERENCES public.hesaplar(id) ON DELETE SET NULL;
