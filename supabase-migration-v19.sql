-- Migration v19: hesaplar tablosuna sahip_tipi kolonu ekle
-- Şirket / Ortak / Çalışan hesaplarını ayırt etmek için.
-- Şirket hesabı ile Ortak/Çalışan hesabı arasındaki transferler
-- otomatik olarak "Cari Hesap" kategorisiyle işaretlenir.

ALTER TABLE public.hesaplar
  ADD COLUMN IF NOT EXISTS sahip_tipi TEXT NOT NULL DEFAULT 'sirket'
    CHECK (sahip_tipi IN ('sirket', 'ortak', 'calisan'));
