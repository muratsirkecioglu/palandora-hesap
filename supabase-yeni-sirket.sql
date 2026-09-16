-- ══════════════════════════════════════════════════════════════
-- YENİ ŞİRKET OLUŞTURMA ŞABLONU
-- ══════════════════════════════════════════════════════════════
--
-- Ne yapar:
--   1. Yeni bir şirket oluşturur
--   2. MEVCUT TÜM KULLANICILARI bu şirkete üye yapar
--
-- Roller hakkında: roller global tutuluyor (kullanicilar.rol). Yani admin olan
-- her şirkette admin, çalışan olan her şirkette çalışan. Kullanıcıyı üye yapmak
-- rolünü olduğu gibi taşır — ayrıca bir şey yapmaya gerek yok.
--
-- ÖN KOŞUL: Önce v24'ü çalıştırmış ol. Geçiş DEFAULT'u açıkken ikinci şirket
-- oluşturmak, sirket_id göndermeyen bir kodun sessizce 1. şirkete yazmasına
-- ve iki şirketin verisinin karışmasına yol açar.
--
-- Aynı isimde şirket varsa hata verip durur (yanlışlıkla ikinci kez
-- çalıştırmaya karşı koruma).

DO $do$
DECLARE
  -- ↓↓↓ SADECE BURAYI DEĞİŞTİR ↓↓↓
  v_ad text := 'İkinci Şirket Adı';
  -- ↑↑↑ SADECE BURAYI DEĞİŞTİR ↑↑↑

  v_sirket uuid;
  v_uye_sayisi int;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sirketler WHERE ad = v_ad) THEN
    RAISE EXCEPTION 'Bu isimde bir şirket zaten var: %', v_ad;
  END IF;

  INSERT INTO public.sirketler (ad) VALUES (v_ad) RETURNING id INTO v_sirket;

  -- Tüm kullanıcılar yeni şirkete üye olur (rolleri global olduğu için aynen korunur).
  -- Yalnızca aktif kullanıcıları taşımak istersen alttaki satırı aç:
  --   WHERE k.aktif = true
  INSERT INTO public.kullanici_sirket (kullanici_id, sirket_id)
  SELECT k.id, v_sirket
  FROM public.kullanicilar k
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_uye_sayisi = ROW_COUNT;

  RAISE NOTICE 'Şirket oluşturuldu: "%" (id: %) — % kullanıcı üye yapıldı.',
    v_ad, v_sirket, v_uye_sayisi;
END
$do$;

-- ── Sonucu doğrula ────────────────────────────────────────────
-- Hangi kullanıcı hangi şirkette, rolü ne:
SELECT s.ad AS sirket, k.ad_soyad, k.email, k.rol, k.aktif
FROM public.kullanici_sirket ks
JOIN public.sirketler s ON s.id = ks.sirket_id
JOIN public.kullanicilar k ON k.id = ks.kullanici_id
ORDER BY s.ad, k.ad_soyad;
