-- Migration v35: Fatura kaydı ve kalem bazlı satırlar
--
-- Fatura AYRI bir varlık değil; işlemin kendisidir. Ödemeler, stok hareketleri,
-- cari ve KDV zaten islemler'e bağlı olduğu için ayrı bir faturalar tablosu
-- ikili kayıt ve senkron sorunu yaratırdı. Bu yüzden islemler'e fatura_no,
-- yanına da kalem tablosu eklenir.
--
-- TUTAR MANTIĞI — mevcut anlam korunur:
--   islem_kalemleri.birim_fiyat  → KDV HARİÇ birim fiyat (faturadaki gibi)
--   satır matrahı = miktar * birim_fiyat
--   satır KDV     = matrah * kdv_orani / 100
--   islemler.tutar      = Σ matrah + Σ KDV   (yani KDV DAHİL toplam — değişmedi)
--   islemler.kdv_tutari = Σ KDV
--
-- Kalem girilmesi ZORUNLU DEĞİL. Kira, vergi gibi kalemsiz işlemler eskisi
-- gibi tek tutarla girilmeye devam eder. Kalem varsa tutar ve KDV onlardan
-- hesaplanır ve elle girilemez.

ALTER TABLE public.islemler
  ADD COLUMN IF NOT EXISTS fatura_no text;

-- Fatura no ile arama/eşleştirme için
CREATE INDEX IF NOT EXISTS idx_islemler_fatura_no ON public.islemler(sirket_id, fatura_no)
  WHERE fatura_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.islem_kalemleri (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sirket_id uuid NOT NULL REFERENCES public.sirketler(id) ON DELETE RESTRICT,
  islem_id uuid NOT NULL REFERENCES public.islemler(id) ON DELETE CASCADE,
  sira integer NOT NULL DEFAULT 0,
  aciklama text NOT NULL,
  miktar numeric(12,3) NOT NULL DEFAULT 1 CHECK (miktar > 0),
  birim text NOT NULL DEFAULT 'Adet',
  -- KDV HARİÇ birim fiyat
  birim_fiyat numeric(12,2) NOT NULL DEFAULT 0 CHECK (birim_fiyat >= 0),
  kdv_orani numeric(5,2) NOT NULL DEFAULT 0 CHECK (kdv_orani >= 0 AND kdv_orani <= 100),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_islem_kalemleri_islem ON public.islem_kalemleri(islem_id);
CREATE INDEX IF NOT EXISTS idx_islem_kalemleri_sirket ON public.islem_kalemleri(sirket_id);

ALTER TABLE public.islem_kalemleri ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "islem_kalemleri_select" ON public.islem_kalemleri;
CREATE POLICY "islem_kalemleri_select" ON public.islem_kalemleri
  FOR SELECT USING (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "islem_kalemleri_insert" ON public.islem_kalemleri;
CREATE POLICY "islem_kalemleri_insert" ON public.islem_kalemleri
  FOR INSERT WITH CHECK (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "islem_kalemleri_update" ON public.islem_kalemleri;
CREATE POLICY "islem_kalemleri_update" ON public.islem_kalemleri
  FOR UPDATE USING (public.sirket_uyesi(sirket_id)) WITH CHECK (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "islem_kalemleri_delete" ON public.islem_kalemleri;
CREATE POLICY "islem_kalemleri_delete" ON public.islem_kalemleri
  FOR DELETE USING (public.sirket_uyesi(sirket_id));

-- İşlem silinince kalemler de gitsin (islem_id CASCADE bunu zaten sağlıyor,
-- ancak islemler'in BEFORE DELETE trigger'ı ile tutarlı olsun diye burada da
-- açıkça temizliyoruz).
CREATE OR REPLACE FUNCTION public.fn_islem_sil_baglantilar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  DELETE FROM public.odemeler        WHERE islem_id = OLD.id;
  DELETE FROM public.islem_stok      WHERE islem_id = OLD.id;
  DELETE FROM public.islem_kalemleri WHERE islem_id = OLD.id;

  IF current_setting('app.demirbaş_siliyor', true) <> '1' THEN
    PERFORM set_config('app.islem_siliyor', '1', true);
    DELETE FROM public.demirbaslar WHERE kaynak_islem_id = OLD.id;
  END IF;

  RETURN OLD;
END;
$fn$;
