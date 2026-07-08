-- Migration v22: Çalışanlar tüm işlemleri düzenleyebilsin ve silebilsin.
-- Önceden: sadece kaydın sahibi veya admin güncelleyebilir/silebilirdi.
-- Şimdi: giriş yapmış her kullanıcı tüm işlem ve ödemelerde tam yetkili.

DROP POLICY IF EXISTS "islemler_update" ON public.islemler;
CREATE POLICY "islemler_update" ON public.islemler
  FOR UPDATE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "islemler_delete" ON public.islemler;
CREATE POLICY "islemler_delete" ON public.islemler
  FOR DELETE USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "odemeler_delete" ON public.odemeler;
CREATE POLICY "odemeler_delete" ON public.odemeler
  FOR DELETE USING (auth.uid() IS NOT NULL);
