-- Migration v26: Şirkete tema rengi
--
-- tema_hue: HSL renk tonu (0-360). Uygulama yalnızca bu tonu değiştirir;
-- doygunluk ve parlaklık açık/koyu temaya ait kalır, böylece hangi renk
-- seçilirse seçilsin kontrast bozulmaz.
--
-- Varsayılan 221 = mevcut mavi, yani bu migration görünümü değiştirmez.
--
-- Referans tonlar:
--   0 kırmızı · 25 turuncu · 45 amber · 140 yeşil · 175 turkuaz
--   200 açık mavi · 221 mavi (varsayılan) · 262 mor · 300 fuşya · 340 pembe

ALTER TABLE public.sirketler
  ADD COLUMN IF NOT EXISTS tema_hue integer NOT NULL DEFAULT 221;

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sirketler_tema_hue_check'
      AND conrelid = 'public.sirketler'::regclass
  ) THEN
    ALTER TABLE public.sirketler
      ADD CONSTRAINT sirketler_tema_hue_check CHECK (tema_hue BETWEEN 0 AND 360);
  END IF;
END
$do$;

-- Şirket silme yetkisi (yönetim arayüzü için; v23'te yoktu)
DROP POLICY IF EXISTS "sirketler_delete" ON public.sirketler;
CREATE POLICY "sirketler_delete" ON public.sirketler
  FOR DELETE USING (public.admin_mi());
