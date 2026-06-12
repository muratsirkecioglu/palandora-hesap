-- =====================================================
-- Migration v10: Demirbaşlar ↔ İşlemler bağlantısı
-- =====================================================

-- 1. demirbaslar tablosuna kaynak_islem_id ekle
ALTER TABLE public.demirbaslar
  ADD COLUMN IF NOT EXISTS kaynak_islem_id UUID
    REFERENCES public.islemler(id)
    DEFERRABLE INITIALLY DEFERRED;

-- 2. Demirbaş silinince bağlı işlemi de sil (recursion guard ile)
CREATE OR REPLACE FUNCTION public.fn_demirbaş_sil_islem()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.islem_siliyor', true) = '1' THEN
    RETURN OLD;
  END IF;
  IF OLD.kaynak_islem_id IS NOT NULL THEN
    PERFORM set_config('app.demirbaş_siliyor', '1', true);
    DELETE FROM public.islemler WHERE id = OLD.kaynak_islem_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_demirbaş_sil_islem ON public.demirbaslar;
CREATE TRIGGER tr_demirbaş_sil_islem
  BEFORE DELETE ON public.demirbaslar
  FOR EACH ROW EXECUTE FUNCTION public.fn_demirbaş_sil_islem();

-- 3. İşlem silinince bağlı demirbaşı da sil (recursion guard ile)
CREATE OR REPLACE FUNCTION public.fn_islem_sil_demirbaş()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.demirbaş_siliyor', true) = '1' THEN
    RETURN OLD;
  END IF;
  PERFORM set_config('app.islem_siliyor', '1', true);
  DELETE FROM public.demirbaslar WHERE kaynak_islem_id = OLD.id;
  RETURN OLD;
END;
$$;

-- Mevcut tr_islem_sil_malzeme trigger'ı varsa genişlet, yoksa yeni oluştur
-- (Her ikisini de çalıştırmak için ayrı bir fonksiyon)
CREATE OR REPLACE FUNCTION public.fn_islem_sil_baglantilar()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.malzeme_siliyor', true) <> '1' THEN
    PERFORM set_config('app.islem_siliyor', '1', true);
    DELETE FROM public.malzemeler WHERE kaynak_islem_id = OLD.id;
  END IF;
  IF current_setting('app.demirbaş_siliyor', true) <> '1' THEN
    PERFORM set_config('app.islem_siliyor', '1', true);
    DELETE FROM public.demirbaslar WHERE kaynak_islem_id = OLD.id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_islem_sil_malzeme ON public.islemler;
DROP TRIGGER IF EXISTS tr_islem_sil_demirbaş ON public.islemler;
DROP TRIGGER IF EXISTS tr_islem_sil_baglantilar ON public.islemler;

CREATE TRIGGER tr_islem_sil_baglantilar
  BEFORE DELETE ON public.islemler
  FOR EACH ROW EXECUTE FUNCTION public.fn_islem_sil_baglantilar();
