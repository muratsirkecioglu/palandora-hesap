-- Önizleme: "Transfer" kategorili, açıklamasında "borç" geçen işlemleri listele
-- Bu sorgu hiçbir şeyi DEĞİŞTİRMEZ, sadece gösterir.

SELECT id, tarih, aciklama, tutar, tur, kategori, hesap_id
FROM public.islemler
WHERE kategori = 'Transfer'
  AND aciklama ILIKE '%borç%'
ORDER BY tarih DESC;
