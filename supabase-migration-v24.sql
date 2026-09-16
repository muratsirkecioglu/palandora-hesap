-- Migration v24: Geçiş güvenliğini kaldır.
--
-- v23'te sirket_id kolonlarına 1. şirket DEFAULT olarak atanmıştı; amacı,
-- frontend güncellenene kadar eski kodun çalışmaya devam etmesiydi.
--
-- ÖNCE frontend'in canlıda olduğunu ve uygulamanın düzgün çalıştığını doğrula,
-- SONRA bunu çalıştır. İkinci şirketi oluşturmadan önce mutlaka çalıştırılmalı:
-- DEFAULT açık kalırsa, sirket_id göndermeyi unutan bir kod sessizce 1. şirkete
-- yazar ve iki şirketin verisi karışır.

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hesaplar','islemler','odemeler','islem_stok','malzemeler','demirbaslar']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN sirket_id DROP DEFAULT', t);
  END LOOP;
END
$do$;
