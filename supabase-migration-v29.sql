-- Migration v29: Üretim ve açılış stoğu
--
-- Şimdiye kadar her stok hareketi bir alış/satış işlemine bağlıydı
-- (islem_stok.islem_id NOT NULL). İki yeni ihtiyaç bunu kırıyor:
--
--   Üretim       : hammadde stoktan düşer, üretilen ürün stoğa girer.
--                  Ortada bir alış/satış işlemi yoktur.
--   Açılış stoğu : sisteme geçmeden önce elde olan stok; satın alma kaydı yok.
--
-- Çözüm: islem_stok tek stok defteri olarak kalır ama kaynağı üç türlü olabilir.
-- kaynak kolonu hangi tür olduğunu, CHECK kısıtı da ilgili bağlantının dolu
-- olmasını garanti eder.
--
-- ÖN KOŞUL: v23 bu ortamda çalışmış olmalı (sirketler tablosu ve sirket_uyesi
-- fonksiyonu gerekir). Kontrol:
--   SELECT to_regclass('public.sirketler'), to_regproc('public.sirket_uyesi(uuid)');
-- İkisi de null dönmemeli.
--
-- ÇALIŞTIRMA: Tamamını tek seferde çalıştır. Editörde metnin bir kısmı
-- SEÇİLİYSE Supabase yalnızca seçili kısmı çalıştırır — seçimi kaldır.
-- Sorun çıkarsa aşağıdaki 1/2/3 bölümlerini sırayla tek tek çalıştırabilirsin.

-- ─────────────────────────────────────────────────────────────
-- 1) Üretim kayıtları
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.uretimler (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sirket_id uuid NOT NULL REFERENCES public.sirketler(id) ON DELETE RESTRICT,
  tarih date NOT NULL,
  malzeme_id uuid NOT NULL REFERENCES public.malzemeler(id) ON DELETE RESTRICT,
  miktar numeric(12,3) NOT NULL CHECK (miktar > 0),
  iscilik_tutari numeric(12,2) NOT NULL DEFAULT 0,
  adam_saat numeric(10,2),
  aciklama text,
  kullanici_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uretimler_sirket ON public.uretimler(sirket_id);
CREATE INDEX IF NOT EXISTS idx_uretimler_malzeme ON public.uretimler(malzeme_id);

ALTER TABLE public.uretimler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "uretimler_select" ON public.uretimler;
CREATE POLICY "uretimler_select" ON public.uretimler
  FOR SELECT USING (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "uretimler_insert" ON public.uretimler;
CREATE POLICY "uretimler_insert" ON public.uretimler
  FOR INSERT WITH CHECK (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "uretimler_update" ON public.uretimler;
CREATE POLICY "uretimler_update" ON public.uretimler
  FOR UPDATE USING (public.sirket_uyesi(sirket_id)) WITH CHECK (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "uretimler_delete" ON public.uretimler;
CREATE POLICY "uretimler_delete" ON public.uretimler
  FOR DELETE USING (public.sirket_uyesi(sirket_id));

-- ─────────────────────────────────────────────────────────────
-- 2) islem_stok: işlemden bağımsız hareketlere izin ver
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.islem_stok
  ALTER COLUMN islem_id DROP NOT NULL;

ALTER TABLE public.islem_stok
  ADD COLUMN IF NOT EXISTS uretim_id uuid REFERENCES public.uretimler(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS kaynak text NOT NULL DEFAULT 'islem',
  -- Hareketin kendi tarihi. Alış/satışta işlemin tarihiyle aynıdır; üretim ve
  -- açılış stoğunda tek tarih kaynağı budur.
  ADD COLUMN IF NOT EXISTS tarih date;

CREATE INDEX IF NOT EXISTS idx_islem_stok_uretim ON public.islem_stok(uretim_id);

-- Mevcut satırların hepsi bir işlemden geliyor
UPDATE public.islem_stok SET kaynak = 'islem' WHERE kaynak IS DISTINCT FROM 'islem';

-- Geçmiş hareketlerin tarihini bağlı işlemden doldur
UPDATE public.islem_stok s
SET tarih = i.tarih
FROM public.islemler i
WHERE s.islem_id = i.id AND s.tarih IS NULL;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'islem_stok_kaynak_check'
      AND conrelid = 'public.islem_stok'::regclass
  ) THEN
    ALTER TABLE public.islem_stok ADD CONSTRAINT islem_stok_kaynak_check CHECK (
      (kaynak = 'islem'  AND islem_id IS NOT NULL AND uretim_id IS NULL) OR
      (kaynak = 'uretim' AND uretim_id IS NOT NULL AND islem_id IS NULL) OR
      (kaynak = 'acilis' AND islem_id IS NULL AND uretim_id IS NULL)
    );
  END IF;
END
$do$;

-- ─────────────────────────────────────────────────────────────
-- 3) Malzeme silme trigger'ını NULL islem_id'ye karşı sağlamlaştır
--    Açılış/üretim hareketleri islem_id taşımadığı için, bağlı alış
--    işlemini ararken bunları atlamak gerekiyor.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_malzeme_sil_bagli_islem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $fn$
DECLARE
  v_islem_id uuid;
BEGIN
  SELECT islem_id INTO v_islem_id
  FROM public.islem_stok
  WHERE malzeme_id = OLD.id AND tur = 'giris' AND islem_id IS NOT NULL
  LIMIT 1;

  DELETE FROM public.islem_stok WHERE malzeme_id = OLD.id;

  IF v_islem_id IS NOT NULL THEN
    PERFORM set_config('app.malzeme_siliyor', '1', true);
    DELETE FROM public.islemler WHERE id = v_islem_id;
  END IF;

  RETURN OLD;
END;
$fn$;
