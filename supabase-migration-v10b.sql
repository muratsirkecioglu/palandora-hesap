-- =====================================================
-- Migration v10b: Mevcut demirbaşlar için gider backfill
-- alis_fiyati dolu olan demirbaşlara bağlı gider işlemi
-- oluşturur ve kaynak_islem_id'yi günceller.
-- =====================================================

DO $$
DECLARE
  v_admin_id UUID;
  d         RECORD;
  v_islem_id UUID;
BEGIN
  -- İlk aktif admin kullanıcıyı al
  SELECT id INTO v_admin_id
  FROM public.kullanicilar
  WHERE rol = 'admin' AND aktif = true
  ORDER BY created_at
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Aktif admin kullanıcı bulunamadı.';
  END IF;

  FOR d IN
    SELECT *
    FROM public.demirbaslar
    WHERE kaynak_islem_id IS NULL
      AND alis_fiyati IS NOT NULL
    ORDER BY created_at
  LOOP
    INSERT INTO public.islemler (
      tarih,
      aciklama,
      tutar,
      tur,
      kategori,
      odeme_durumu,
      odenen_tutar,
      faturali,
      kullanici_id
    ) VALUES (
      COALESCE(d.alis_tarihi::date, CURRENT_DATE),
      d.ad,
      d.alis_fiyati,
      'gider',
      'Demirbaş',
      'odendi',
      d.alis_fiyati,
      true,
      v_admin_id
    )
    RETURNING id INTO v_islem_id;

    UPDATE public.demirbaslar
    SET kaynak_islem_id = v_islem_id,
        updated_at      = now()
    WHERE id = d.id;

    RAISE NOTICE 'Demirbaş: % → islem: %', d.ad, v_islem_id;
  END LOOP;
END;
$$;
