-- Migration v28: Demirbaş satışı
--
-- Demirbaş alışı bir GİDER işleminden geliyordu; satış da simetrik olarak bir
-- GELİR işlemi oluşturur ve demirbaşa bağlanır.
--
-- Kısmi satış: adet=10 olan bir kayıttan 3 tanesi satılırsa, orijinal satır
-- adet=7'ye düşer ve satılan 3 için durum='satildi' olan ayrı bir satır açılır.
-- Böylece hem kalan stok hem de satış geçmişi doğru kalır.
--
-- satis_fiyati BİRİM satış fiyatıdır (alis_fiyati ile tutarlı).

ALTER TABLE public.demirbaslar
  ADD COLUMN IF NOT EXISTS satis_tarihi date,
  ADD COLUMN IF NOT EXISTS satis_fiyati numeric(12,2),
  ADD COLUMN IF NOT EXISTS satis_islem_id uuid REFERENCES public.islemler(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_demirbaslar_satis_islem ON public.demirbaslar(satis_islem_id);

-- durum listesine 'satildi' ekle
DO $do$
DECLARE
  v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.demirbaslar'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%durum%';

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.demirbaslar DROP CONSTRAINT %I', v_con);
  END IF;

  ALTER TABLE public.demirbaslar
    ADD CONSTRAINT demirbaslar_durum_check
    CHECK (durum IN ('aktif', 'bakimda', 'hurda', 'devredildi', 'satildi'));
END
$do$;
