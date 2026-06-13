-- Migration v14: odeme_durumu sütunu kaldırıldı — durum odened_tutar'dan hesaplanıyor

-- Trigger'ı güncelle: odeme_durumu referansını kaldır
CREATE OR REPLACE FUNCTION public.sync_odened_tutar()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_islem_id uuid;
  v_sum numeric;
BEGIN
  v_islem_id := COALESCE(NEW.islem_id, OLD.islem_id);

  SELECT COALESCE(SUM(o.tutar), 0)
  INTO v_sum
  FROM public.odemeler o
  WHERE o.islem_id = v_islem_id;

  UPDATE public.islemler
  SET odenen_tutar = v_sum
  WHERE id = v_islem_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- odeme_durumu sütununu kaldır
ALTER TABLE public.islemler DROP COLUMN IF EXISTS odeme_durumu;
