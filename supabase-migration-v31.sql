-- Migration v31: Demirbaş grupları
--
-- Demirbaşları adlandırılmış listeler halinde toplamak için:
--   "Başlangıç Demirbaş Listesi", "12.03.2026 Alımı" gibi.
--
-- grup_id nullable: gruba dahil olmayan demirbaşlar "Gruplanmamış" altında
-- kalır. Grup silinince demirbaşlar silinmez, yalnızca gruptan çıkar.

CREATE TABLE IF NOT EXISTS public.demirbas_gruplari (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  sirket_id uuid NOT NULL REFERENCES public.sirketler(id) ON DELETE RESTRICT,
  ad text NOT NULL,
  tarih date,
  aciklama text,
  kullanici_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_demirbas_gruplari_sirket ON public.demirbas_gruplari(sirket_id);

ALTER TABLE public.demirbas_gruplari ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "demirbas_gruplari_select" ON public.demirbas_gruplari;
CREATE POLICY "demirbas_gruplari_select" ON public.demirbas_gruplari
  FOR SELECT USING (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "demirbas_gruplari_insert" ON public.demirbas_gruplari;
CREATE POLICY "demirbas_gruplari_insert" ON public.demirbas_gruplari
  FOR INSERT WITH CHECK (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "demirbas_gruplari_update" ON public.demirbas_gruplari;
CREATE POLICY "demirbas_gruplari_update" ON public.demirbas_gruplari
  FOR UPDATE USING (public.sirket_uyesi(sirket_id)) WITH CHECK (public.sirket_uyesi(sirket_id));
DROP POLICY IF EXISTS "demirbas_gruplari_delete" ON public.demirbas_gruplari;
CREATE POLICY "demirbas_gruplari_delete" ON public.demirbas_gruplari
  FOR DELETE USING (public.sirket_uyesi(sirket_id));

-- Grup silinince demirbaş silinmez, sadece gruptan çıkar.
ALTER TABLE public.demirbaslar
  ADD COLUMN IF NOT EXISTS grup_id uuid REFERENCES public.demirbas_gruplari(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_demirbaslar_grup ON public.demirbaslar(grup_id);
