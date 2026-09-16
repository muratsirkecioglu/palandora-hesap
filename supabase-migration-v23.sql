-- Migration v23: Çok şirketli (multi-tenant) yapıya geçiş
--
-- Mevcut tüm veriler 1. şirkete atanır — hiçbir kayıt kaybolmaz.
-- Geçiş güvenliği: sirket_id kolonuna 1. şirket DEFAULT olarak atanır, böylece
-- frontend güncellenene kadar eski kod da çalışmaya devam eder. Frontend canlıya
-- alındıktan SONRA v24 ile bu DEFAULT kaldırılacak (iki şirket varken açık
-- kalması, sirket_id göndermeyi unutan bir kodun sessizce 1. şirkete yazmasına
-- yol açar).
--
-- Not: DO blokları ve fonksiyon gövdeleri adlandırılmış dollar-quote ($do$/$fn$)
-- kullanır; anonim $$ etiketleri SQL editörlerinde yanlış eşleşebiliyor.
--
-- Bu dosya tekrar tekrar çalıştırılabilir (idempotent).

-- ─────────────────────────────────────────────────────────────
-- 1) Şirketler ve üyelik tabloları
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sirketler (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  ad text NOT NULL,
  aktif boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.sirketler ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.kullanici_sirket (
  kullanici_id uuid NOT NULL REFERENCES public.kullanicilar(id) ON DELETE CASCADE,
  sirket_id uuid NOT NULL REFERENCES public.sirketler(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (kullanici_id, sirket_id)
);
ALTER TABLE public.kullanici_sirket ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- 2) İlk şirket  ── ADINI BURADAN DEĞİŞTİREBİLİRSİN
-- ─────────────────────────────────────────────────────────────
INSERT INTO public.sirketler (ad)
SELECT 'Palandöken'
WHERE NOT EXISTS (SELECT 1 FROM public.sirketler);

-- Mevcut tüm kullanıcılar bu şirkete üye olur
INSERT INTO public.kullanici_sirket (kullanici_id, sirket_id)
SELECT k.id, (SELECT id FROM public.sirketler ORDER BY created_at LIMIT 1)
FROM public.kullanicilar k
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- 3) Veri tablolarına sirket_id ekle, mevcut satırları doldur
-- ─────────────────────────────────────────────────────────────
DO $do$
DECLARE
  v_sirket uuid := (SELECT id FROM public.sirketler ORDER BY created_at LIMIT 1);
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hesaplar','islemler','odemeler','islem_stok','malzemeler','demirbaslar']
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS sirket_id uuid REFERENCES public.sirketler(id) ON DELETE RESTRICT', t);
    EXECUTE format('UPDATE public.%I SET sirket_id = $1 WHERE sirket_id IS NULL', t) USING v_sirket;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN sirket_id SET NOT NULL', t);
    -- Geçiş güvenliği (v24'te kaldırılacak)
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN sirket_id SET DEFAULT %L', t, v_sirket);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_sirket ON public.%I(sirket_id)', t, t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END
$do$;

-- ─────────────────────────────────────────────────────────────
-- 4) Yetki yardımcı fonksiyonları
--    SECURITY DEFINER: üyelik tablosunun kendi RLS'ine takılmasın diye.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sirket_uyesi(p_sirket_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.kullanici_sirket ks
    WHERE ks.kullanici_id = auth.uid() AND ks.sirket_id = p_sirket_id
  );
$fn$;

CREATE OR REPLACE FUNCTION public.admin_mi()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.kullanicilar k
    WHERE k.id = auth.uid() AND k.rol = 'admin'
  );
$fn$;

-- ─────────────────────────────────────────────────────────────
-- 5) Eski politikaları temizle, şirket bazlı yenilerini kur
-- ─────────────────────────────────────────────────────────────
DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('hesaplar','islemler','odemeler','islem_stok','malzemeler','demirbaslar')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END
$do$;

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hesaplar','islemler','odemeler','islem_stok','malzemeler','demirbaslar']
  LOOP
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (public.sirket_uyesi(sirket_id))', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT WITH CHECK (public.sirket_uyesi(sirket_id))', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE USING (public.sirket_uyesi(sirket_id)) WITH CHECK (public.sirket_uyesi(sirket_id))', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE USING (public.sirket_uyesi(sirket_id))', t || '_delete', t);
  END LOOP;
END
$do$;

-- Şirketler: kullanıcı yalnızca üye olduğu şirketleri görür
DROP POLICY IF EXISTS "sirketler_select" ON public.sirketler;
CREATE POLICY "sirketler_select" ON public.sirketler
  FOR SELECT USING (public.sirket_uyesi(id));

DROP POLICY IF EXISTS "sirketler_insert" ON public.sirketler;
CREATE POLICY "sirketler_insert" ON public.sirketler
  FOR INSERT WITH CHECK (public.admin_mi());

DROP POLICY IF EXISTS "sirketler_update" ON public.sirketler;
CREATE POLICY "sirketler_update" ON public.sirketler
  FOR UPDATE USING (public.admin_mi());

-- Üyelik: kullanıcı kendi üyeliklerini görür, admin hepsini yönetir
DROP POLICY IF EXISTS "kullanici_sirket_select" ON public.kullanici_sirket;
CREATE POLICY "kullanici_sirket_select" ON public.kullanici_sirket
  FOR SELECT USING (kullanici_id = auth.uid() OR public.admin_mi());

DROP POLICY IF EXISTS "kullanici_sirket_insert" ON public.kullanici_sirket;
CREATE POLICY "kullanici_sirket_insert" ON public.kullanici_sirket
  FOR INSERT WITH CHECK (public.admin_mi());

DROP POLICY IF EXISTS "kullanici_sirket_delete" ON public.kullanici_sirket;
CREATE POLICY "kullanici_sirket_delete" ON public.kullanici_sirket
  FOR DELETE USING (public.admin_mi());
