-- =====================================================
-- Migration v6: Malzeme ↔ İşlem çift yönlü bağlantısı
-- =====================================================
-- Her malzeme kaydının bir "gider" işlemiyle eşleştirilmesi.
-- Birini silince diğeri de silinir (döngüsel sileye karşı
-- session değişkeni kullanılır).
-- =====================================================

-- 1. Bağlantı kolonu ekle
-- DEFERRABLE: İki yönlü silme sırasında FK kontrolünü transaction
--             sonuna erteler, böylece ara aşamada ihlal oluşmaz.
ALTER TABLE public.malzemeler
  ADD COLUMN IF NOT EXISTS kaynak_islem_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_malzeme_kaynak_islem'
  ) THEN
    ALTER TABLE public.malzemeler
      ADD CONSTRAINT fk_malzeme_kaynak_islem
        FOREIGN KEY (kaynak_islem_id)
        REFERENCES public.islemler(id)
        DEFERRABLE INITIALLY DEFERRED;
  END IF;
END;
$$;

-- 2. Mevcut malzemeler için eşlenik gider işlemi oluştur
DO $$
DECLARE
  m      RECORD;
  yeni_id UUID;
  tutar   NUMERIC;
BEGIN
  FOR m IN
    SELECT * FROM public.malzemeler WHERE kaynak_islem_id IS NULL
  LOOP
    tutar := m.miktar * m.birim_fiyat + COALESCE(m.nakliye_tutari, 0);

    INSERT INTO public.islemler (
      tarih, aciklama, tutar, tur, kategori,
      odeme_durumu, odenen_tutar, kullanici_id
    ) VALUES (
      COALESCE(m.alis_tarihi, m.created_at::DATE),
      m.ad || ' alımı',
      tutar,
      'gider',
      'Malzeme',
      'odendi',
      tutar,
      m.kullanici_id
    )
    RETURNING id INTO yeni_id;

    UPDATE public.malzemeler
      SET kaynak_islem_id = yeni_id
    WHERE id = m.id;
  END LOOP;
END;
$$;

-- 3. Malzeme silinince → bağlı işlem silinsin
CREATE OR REPLACE FUNCTION fn_malzeme_sil_bagli_islem()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- İşlem tarafından tetiklenen zincir silme ise dur
  IF current_setting('app.islem_siliyor', true) = '1' THEN
    RETURN OLD;
  END IF;

  IF OLD.kaynak_islem_id IS NOT NULL THEN
    PERFORM set_config('app.malzeme_siliyor', '1', true);
    DELETE FROM public.islemler WHERE id = OLD.kaynak_islem_id;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_malzeme_sil_islem ON public.malzemeler;
CREATE TRIGGER tr_malzeme_sil_islem
  BEFORE DELETE ON public.malzemeler
  FOR EACH ROW EXECUTE FUNCTION fn_malzeme_sil_bagli_islem();

-- 4. İşlem silinince → bağlı malzeme silinsin
CREATE OR REPLACE FUNCTION fn_islem_sil_bagli_malzeme()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Malzeme tarafından tetiklenen zincir silme ise dur
  IF current_setting('app.malzeme_siliyor', true) = '1' THEN
    RETURN OLD;
  END IF;

  PERFORM set_config('app.islem_siliyor', '1', true);
  DELETE FROM public.malzemeler WHERE kaynak_islem_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS tr_islem_sil_malzeme ON public.islemler;
CREATE TRIGGER tr_islem_sil_malzeme
  BEFORE DELETE ON public.islemler
  FOR EACH ROW EXECUTE FUNCTION fn_islem_sil_bagli_malzeme();
