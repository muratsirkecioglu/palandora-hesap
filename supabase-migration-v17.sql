-- Migration v17: trigger fonksiyonlarını v16 sonrasına uyumlu hale getir
-- malzemeler.kaynak_islem_id ve malzemeler.miktar v16'da silindi

-- ── 1. fn_islem_sil_baglantilar ─────────────────────────────────────────
-- Eski trigger: malzemeler WHERE kaynak_islem_id = OLD.id → kolon artık yok
-- Yeni davranış: odemeler + islem_stok cascade sil, demirbaş silmeye devam et

DROP TRIGGER IF EXISTS tr_islem_sil_baglantilar ON public.islemler;
DROP FUNCTION IF EXISTS public.fn_islem_sil_baglantilar();

CREATE OR REPLACE FUNCTION public.fn_islem_sil_baglantilar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.odemeler   WHERE islem_id = OLD.id;
  DELETE FROM public.islem_stok WHERE islem_id = OLD.id;

  IF current_setting('app.demirbaş_siliyor', true) <> '1' THEN
    PERFORM set_config('app.islem_siliyor', '1', true);
    DELETE FROM public.demirbaslar WHERE kaynak_islem_id = OLD.id;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER tr_islem_sil_baglantilar
BEFORE DELETE ON public.islemler
FOR EACH ROW EXECUTE FUNCTION public.fn_islem_sil_baglantilar();

-- ── 2. fn_malzeme_sil_bagli_islem ───────────────────────────────────────
-- Eski trigger: kaynak_islem_id ve miktar kullanıyordu → bu kolonlar artık yok
-- Yeni davranış: malzemeye ait islem_stok kayıtlarını sil,
--                giris kaydının bağlı islemini de sil (gider kaydı temizlensin)

DROP TRIGGER IF EXISTS tr_malzeme_sil_islem ON public.malzemeler;
DROP FUNCTION IF EXISTS public.fn_malzeme_sil_bagli_islem();

CREATE OR REPLACE FUNCTION public.fn_malzeme_sil_bagli_islem()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_islem_id uuid;
BEGIN
  -- Bu malzemenin giriş işlemini bul
  SELECT islem_id INTO v_islem_id
  FROM public.islem_stok
  WHERE malzeme_id = OLD.id AND tur = 'giris'
  LIMIT 1;

  -- Malzemeye ait tüm stok hareketlerini sil
  DELETE FROM public.islem_stok WHERE malzeme_id = OLD.id;

  -- Bağlı satın alma işlemini sil (odemeler + islem_stok trigger ile cascade olur)
  IF v_islem_id IS NOT NULL THEN
    PERFORM set_config('app.malzeme_siliyor', '1', true);
    DELETE FROM public.islemler WHERE id = v_islem_id;
  END IF;

  RETURN OLD;
END;
$$;

CREATE TRIGGER tr_malzeme_sil_islem
BEFORE DELETE ON public.malzemeler
FOR EACH ROW EXECUTE FUNCTION public.fn_malzeme_sil_bagli_islem();
