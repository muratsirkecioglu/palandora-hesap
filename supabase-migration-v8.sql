-- =====================================================
-- Migration v8: Hesaplar (banka/kasa/kredi kartı vb.)
-- =====================================================

-- 1. Hesaplar tablosu
CREATE TABLE IF NOT EXISTS public.hesaplar (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ad               TEXT        NOT NULL,
  tur              TEXT        NOT NULL DEFAULT 'banka',
  -- banka | kasa | kredi_karti | diger
  para_birimi      TEXT        NOT NULL DEFAULT 'TRY',
  bakiye_baslangic NUMERIC     NOT NULL DEFAULT 0,
  aktif            BOOLEAN     NOT NULL DEFAULT true,
  notlar           TEXT        NULL,
  kullanici_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. RLS
ALTER TABLE public.hesaplar ENABLE ROW LEVEL SECURITY;

-- Herkes okuyabilir (tüm çalışanlar hesapları görebilir)
CREATE POLICY "hesap_select" ON public.hesaplar
  FOR SELECT USING (true);

-- Sadece admin yazabilir
CREATE POLICY "hesap_insert" ON public.hesaplar
  FOR INSERT WITH CHECK (is_admin());

CREATE POLICY "hesap_update" ON public.hesaplar
  FOR UPDATE USING (is_admin());

CREATE POLICY "hesap_delete" ON public.hesaplar
  FOR DELETE USING (is_admin());

-- 3. islemler tablosuna hesap_id ekle
ALTER TABLE public.islemler
  ADD COLUMN IF NOT EXISTS hesap_id UUID REFERENCES public.hesaplar(id) ON DELETE SET NULL;
