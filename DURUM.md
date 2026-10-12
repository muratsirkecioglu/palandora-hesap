# Durum Notu

Son güncelleme: 2026-10-12

## Bekleyen işler

### Çalıştırılmamış migration'lar
Supabase SQL Editor'de **sırayla** çalıştırılmalı:

- `supabase-migration-v34.sql` — KDV (`islemler.kdv_orani`, `kdv_tutari`)
- `supabase-migration-v35.sql` — Fatura no + `islem_kalemleri` tablosu

v33'e kadar olanlar uygulandı (doğrulandı).

Hangi migration'ların uygulandığını kontrol:

```sql
SELECT
  to_regclass('public.cariler')         AS v33_cariler,
  to_regclass('public.islem_kalemleri') AS v35_kalemler,
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema='public' AND table_name='islemler'
      AND column_name IN ('cari_id','kdv_orani','kdv_tutari','fatura_no')) AS kolonlar;
```

`kolonlar` 4 dönmeli; `v35_kalemler` null ise v35 çalışmamıştır.

### Güvenlik uyarıları (npm audit)

- **`react-router` (yüksek)** — proje başından beri var, bizim eklediğimiz
  değil. Açıklar SSR/RSC ile ilgili; uygulama `HashRouter` ile tamamen
  istemci tarafında çalıştığı için etkilenmiyor. `npm audit fix` ile kırıcı
  olmadan düzelebilir ama yönlendirmeyi etkileyebileceğinden
  **onay bekliyor**.
- **`uuid` (orta)** — `exceljs` ile geldi. Açık yalnızca uuid v3/v5/v6'ya
  dışarıdan `buf` verildiğinde tetikleniyor; exceljs bunu yapmıyor.
  Düzeltmesi exceljs'i 3.4.0'a düşürmek (kırıcı) — yapılmadı.

## Ön muhasebe yol haritası

Tamamlananlar:

1. ✅ **Cari hesaplar** (v33) — müşteri/tedarikçi, ekstre, bakiye, yaşlandırma
2. ✅ **KDV** (v34) — oran/tutar, matrah ayrıştırma, aylık KDV özeti
3. ✅ **Fatura** (v35) — fatura no, kalem bazlı satırlar
4. ✅ **Raporlar** — Gelir tablosu, KDV, cari yaşlandırma, işlem dökümü
   + Excel (`exceljs`, dinamik import) ve PDF (tarayıcı yazdırma motoru)

Sıradaki olası adımlar: çek/senet takibi, banka ekstresi içe aktarma +
mutabakat, tekrarlayan işlemler, personel/bordro.

## Mimari kararlar (değiştirmeden önce oku)

- **`islemler.tutar` KDV DAHİL toplamdır.** Ödemeler, stok birim fiyatları,
  demirbaş alış fiyatları ve üretim maliyetleri buna bağlı. KDV bu toplamın
  içinden ayrıştırılır: `kdv = tutar * oran / (100 + oran)`.
- **Fatura ayrı bir tablo değil**, işlemin kendisi. Kalem girilirse tutar ve
  KDV kalemlerden hesaplanır ve kilitlenir; kalem yoksa tek tutarla girilir.
- **Ortak/çalışan cari** (`hesaplar.sahip_tipi` + "Cari Hesap" kategorili
  transferler) ile **ticari cari** (`cariler` tablosu) ayrıdır. İlki sermaye
  borç/iadesini, ikincisi müşteri/tedarikçi alacak-borcunu izler.
- **Transferler** hiçbir gelir/gider hesabına veya rapora dahil edilmez
  (`transfer_eslesme_id` ile ayıklanır).
- **PDF** jsPDF ile değil, tarayıcının yazdırma motoruyla üretilir — jsPDF
  varsayılan fontlarıyla Türkçe karakterleri bozuk basıyor.

## Yeni makinede kurulum

```bash
git clone https://github.com/muratsirkecioglu/palandora-hesap.git C:\ws-personal\palandora-hesap
cd C:\ws-personal\palandora-hesap
npm install
```

`.env` dosyası git'te **yok**, elle oluşturulmalı:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
