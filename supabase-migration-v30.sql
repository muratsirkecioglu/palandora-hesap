-- Migration v30: Demirbaş → işlem bağının silinmeyi engellemesini gider
--
-- SORUN: demirbaslar.kaynak_islem_id FK'sı ON DELETE davranışı olmadan
-- tanımlanmıştı (v10). Bağlı demirbaşların silinmesi tamamen bir trigger'a
-- bırakılmıştı; trigger herhangi bir nedenle satırların hepsini silemezse
-- işlem silinemiyor ve FK hatası veriyor. DEFERRABLE INITIALLY DEFERRED
-- olduğu için hata commit anında çıkıyor, bu da sebebini gizliyor.
--
-- ÇÖZÜM: FK'ya ON DELETE CASCADE ver. Trigger zaten demirbaşları kendisi
-- siliyor; CASCADE yalnızca güvenlik ağı olarak devreye girer. İşlem silinince
-- ondan doğan demirbaş kayıtları da gider — mevcut tasarımın amacı zaten buydu.
--
-- Not: demirbaş silinince bağlı işlemi silen trigger (fn_demirbaş_sil_islem)
-- app.islem_siliyor koruması sayesinde bu akışta tekrar tetiklenmez.

DO $do$
DECLARE
  v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.demirbaslar'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.demirbaslar'::regclass AND attname = 'kaynak_islem_id'
    )];

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.demirbaslar DROP CONSTRAINT %I', v_con);
  END IF;

  ALTER TABLE public.demirbaslar
    ADD CONSTRAINT demirbaslar_kaynak_islem_id_fkey
    FOREIGN KEY (kaynak_islem_id)
    REFERENCES public.islemler(id)
    ON DELETE CASCADE;
END
$do$;

-- Aynı sorun islem_stok tarafında da olmasın: islem silinince stok hareketi gitsin.
DO $do$
DECLARE
  v_con text;
BEGIN
  SELECT conname INTO v_con
  FROM pg_constraint
  WHERE conrelid = 'public.islem_stok'::regclass
    AND contype = 'f'
    AND conkey = ARRAY[(
      SELECT attnum FROM pg_attribute
      WHERE attrelid = 'public.islem_stok'::regclass AND attname = 'islem_id'
    )];

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.islem_stok DROP CONSTRAINT %I', v_con);
  END IF;

  ALTER TABLE public.islem_stok
    ADD CONSTRAINT islem_stok_islem_id_fkey
    FOREIGN KEY (islem_id)
    REFERENCES public.islemler(id)
    ON DELETE CASCADE;
END
$do$;

-- ── Doğrula: ON DELETE davranışları ───────────────────────────────────
-- confdeltype: a=NO ACTION, r=RESTRICT, c=CASCADE, n=SET NULL
SELECT conrelid::regclass AS tablo, conname, confdeltype
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid = 'public.islemler'::regclass
ORDER BY 1;
