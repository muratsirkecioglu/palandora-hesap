-- Migration v21: Çalışanlar da tüm işlemleri ve ödemeleri görebilsin.
-- Önceden: çalışan sadece kendi girdiği kayıtları görüyordu (kullanici_id = auth.uid()).
-- Şimdi: giriş yapmış her kullanıcı tüm kayıtları görebilir.
-- Düzenleme/silme yetkileri değişmedi: hâlâ kaydın sahibi veya admin.

DROP POLICY IF EXISTS "islemler_select" ON public.islemler;
CREATE POLICY "islemler_select" ON public.islemler
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "odemeler_select" ON public.odemeler;
CREATE POLICY "odemeler_select" ON public.odemeler
  FOR SELECT USING (auth.uid() IS NOT NULL);
