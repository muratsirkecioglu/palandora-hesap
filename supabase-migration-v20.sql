-- Migration v20: Geçmişte "Transfer" kategorisiyle kaydedilmiş ama aslında
-- Ortak Cari Hesap hareketi olan işlemleri "Cari Hesap" kategorisine taşı.
-- Önizleme sorgusuyla (supabase-migration-v20-preview.sql) doğrulanmıştır:
-- tüm eşleşen kayıtlar Kuveyt Türk ↔ Murat Sirkecioğlu arasındaki
-- "Ortaklardan Borç" / "Ortaklara Borç İade" transferleridir.

UPDATE public.islemler
SET kategori = 'Cari Hesap'
WHERE kategori = 'Transfer'
  AND (aciklama LIKE 'Ortaklardan Borç%' OR aciklama LIKE 'Ortaklara Borç İade%');
