-- Migration v27: Demirbaşta adet
--
-- Önce: 1 satır = 1 fiziksel eşya. Aynı üründen 10 tane alınca 10 kayıt
-- girmek gerekiyordu.
--
-- Şimdi: satır ya tek bir eşyayı (adet=1) ya da aynı üründen bir grubu
-- (adet=N) temsil edebilir. Seri no / zimmet / durum gibi alanların eşya
-- bazında ayrı takibi gerekiyorsa giriş sırasında "her birini ayrı kaydet"
-- seçilir ve N ayrı satır oluşur.
--
-- FİYAT ANLAMI DEĞİŞTİ: alis_fiyati artık BİRİM fiyattır; grubun toplam
-- değeri alis_fiyati * adet'tir. Eski kayıtların hepsi adet=1 olduğu için
-- bu değişiklik onların anlamını bozmaz.

ALTER TABLE public.demirbaslar
  ADD COLUMN IF NOT EXISTS adet integer NOT NULL DEFAULT 1;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'demirbaslar_adet_check'
      AND conrelid = 'public.demirbaslar'::regclass
  ) THEN
    ALTER TABLE public.demirbaslar
      ADD CONSTRAINT demirbaslar_adet_check CHECK (adet > 0);
  END IF;
END
$do$;
