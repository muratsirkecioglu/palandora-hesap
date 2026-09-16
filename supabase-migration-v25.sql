-- Migration v25: Şirket bazlı kullanıcı rolü
--
-- Önce: rol yalnızca global idi (kullanicilar.rol) — admin olan her şirkette adminti.
-- Şimdi: iki seviye var.
--
--   kullanicilar.rol      → SİSTEM rolü. Şirket açma ve "kim hangi şirkete üye"
--                           kararını verme yetkisi. Hiçbir şirkete ait olmadığı
--                           için global kalmak zorunda.
--   kullanici_sirket.rol  → O ŞİRKET İÇİNDEKİ rol. Hesap/stok/demirbaş yönetimi
--                           gibi uygulama içi yetkileri belirler.
--
-- Böylece bir kullanıcı A şirketinde Yönetici, B şirketinde Çalışan olabilir.
--
-- Mevcut üyeliklere kullanıcının global rolü kopyalanır; yani bu migration
-- hiçbir kullanıcının mevcut yetkisini değiştirmez.
--
-- Tekrar çalıştırılabilir (idempotent).

ALTER TABLE public.kullanici_sirket
  ADD COLUMN IF NOT EXISTS rol text NOT NULL DEFAULT 'calisan';

-- CHECK kısıtını yalnızca yoksa ekle
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'kullanici_sirket_rol_check'
      AND conrelid = 'public.kullanici_sirket'::regclass
  ) THEN
    ALTER TABLE public.kullanici_sirket
      ADD CONSTRAINT kullanici_sirket_rol_check CHECK (rol IN ('admin', 'calisan'));
  END IF;
END
$do$;

-- Mevcut üyeliklere global rolü taşı (yalnızca ilk çalıştırmada etkili olur:
-- sonradan şirket bazında değiştirilen rolleri geri almaması için
-- yalnızca varsayılanda kalmış satırlara dokunur).
UPDATE public.kullanici_sirket ks
SET rol = k.rol
FROM public.kullanicilar k
WHERE k.id = ks.kullanici_id
  AND ks.rol = 'calisan'
  AND k.rol = 'admin';

-- Belirli bir şirkette yönetici mi? (ileride RLS'te gerekirse hazır dursun)
CREATE OR REPLACE FUNCTION public.sirket_admini(p_sirket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.kullanici_sirket ks
    WHERE ks.kullanici_id = auth.uid()
      AND ks.sirket_id = p_sirket_id
      AND ks.rol = 'admin'
  );
$fn$;

-- v23'te kullanici_sirket için UPDATE politikası oluşturulmamıştı; rol
-- değişikliği yapılabilmesi için gerekli.
DROP POLICY IF EXISTS "kullanici_sirket_update" ON public.kullanici_sirket;
CREATE POLICY "kullanici_sirket_update" ON public.kullanici_sirket
  FOR UPDATE USING (public.admin_mi()) WITH CHECK (public.admin_mi());

-- ── Doğrula ───────────────────────────────────────────────────
SELECT s.ad AS sirket, k.ad_soyad, k.email,
       k.rol AS sistem_rolu, ks.rol AS sirket_rolu
FROM public.kullanici_sirket ks
JOIN public.sirketler s ON s.id = ks.sirket_id
JOIN public.kullanicilar k ON k.id = ks.kullanici_id
ORDER BY s.ad, k.ad_soyad;
