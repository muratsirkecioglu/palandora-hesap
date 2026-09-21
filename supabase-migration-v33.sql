-- Migration v33: Cari hesaplar (müşteri / tedarikçi)
--
-- Şimdiye kadar bir gelirin kimden geldiği yalnızca açıklama metnindeydi.
-- Artık her işlem bir cariye bağlanabilir; böylece ekstre, bakiye ve
-- yaşlandırma raporları mevcut islemler + odemeler verisinden türetilebilir.
--
-- Bakiye mantığı (yeni tablo gerekmez):
--   gelir işlemi  → cari bize borçlanır  (alacağımız)
--   gider işlemi  → biz cariye borçlanırız (borcumuz)
--   odemeler      → ilgili işlemin kalanını azaltır
--
-- NOT: Ortak/çalışan cari takibi (hesaplar.sahip_tipi + "Cari Hesap"
-- kategorili transferler) bundan ayrıdır ve değişmez. O, şirket ile
-- ortak arasındaki sermaye borç/iadesini izler; bu ise ticari alacak/borcu.

CREATE TABLE IF NOT EXISTS public.cariler (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sirket_id uuid NOT NULL REFERENCES public.sirketler(id) ON DELETE RESTRICT,
  unvan text NOT NULL,
  -- Aynı firma hem müşteri hem tedarikçi olabildiği için üçlü tip
  tip text NOT NULL DEFAULT 'musteri' CHECK (tip IN ('musteri', 'tedarikci', 'her_ikisi')),
  vergi_dairesi text,
  vergi_no text,
  telefon text,
  email text,
  adres text,
  notlar text,
  aktif boolean NOT NULL DEFAULT true,
  kullanici_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cariler_sirket ON public.cariler(sirket_id);

ALTER TABLE public.cariler ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cariler_select" ON public.cariler;
CREATE POLICY "cariler_select" ON public.cariler
  FOR SELECT USING (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "cariler_insert" ON public.cariler;
CREATE POLICY "cariler_insert" ON public.cariler
  FOR INSERT WITH CHECK (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "cariler_update" ON public.cariler;
CREATE POLICY "cariler_update" ON public.cariler
  FOR UPDATE USING (public.sirket_uyesi(sirket_id)) WITH CHECK (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "cariler_delete" ON public.cariler;
CREATE POLICY "cariler_delete" ON public.cariler
  FOR DELETE USING (public.sirket_uyesi(sirket_id));

-- Cari silinince işlem silinmez, yalnızca bağı kopar.
ALTER TABLE public.islemler
  ADD COLUMN IF NOT EXISTS cari_id uuid REFERENCES public.cariler(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_islemler_cari ON public.islemler(cari_id);
