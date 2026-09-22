-- Migration v34: KDV
--
-- ÖNEMLİ — tutar alanının anlamı DEĞİŞMEDİ: tutar hâlâ KDV DAHİL toplamdır.
-- Ödemeler, stok birim fiyatları, demirbaş alış fiyatları ve üretim maliyetleri
-- tutar üzerinden hesaplandığı için anlamını değiştirmek tüm geçmişi bozardı.
-- KDV bu toplamın İÇİNDEN ayrıştırılır:
--
--   kdv_tutari = tutar * oran / (100 + oran)
--   matrah     = tutar - kdv_tutari
--
-- kdv_tutari ayrı kolon olarak tutulur (hesaplanmakla yetinilmez), çünkü
-- faturadaki KDV satır bazlı yuvarlamadan dolayı kuruş farkı gösterebilir;
-- kullanıcı gerektiğinde fatura ile birebir aynı değeri girebilsin.
--
-- Mevcut kayıtlar 0 ile başlar = "KDV belirtilmemiş". Geçmişi doldurmak
-- istersen işlemleri tek tek düzenleyerek oranı seçmen yeterli.

ALTER TABLE public.islemler
  ADD COLUMN IF NOT EXISTS kdv_orani numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS kdv_tutari numeric(12,2) NOT NULL DEFAULT 0;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'islemler_kdv_orani_check'
      AND conrelid = 'public.islemler'::regclass
  ) THEN
    ALTER TABLE public.islemler
      ADD CONSTRAINT islemler_kdv_orani_check CHECK (kdv_orani >= 0 AND kdv_orani <= 100);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'islemler_kdv_tutari_check'
      AND conrelid = 'public.islemler'::regclass
  ) THEN
    ALTER TABLE public.islemler
      ADD CONSTRAINT islemler_kdv_tutari_check CHECK (kdv_tutari >= 0);
  END IF;
END
$do$;

-- KDV özeti dönem bazlı sorgulanacağı için tarih + tür indeksi
CREATE INDEX IF NOT EXISTS idx_islemler_kdv ON public.islemler(sirket_id, tarih)
  WHERE kdv_tutari > 0;
