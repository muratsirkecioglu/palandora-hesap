/**
 * Rapor dışa aktarma yardımcıları.
 *
 * Excel: exceljs ile gerçek .xlsx. Kütüphane DİNAMİK import edilir — yalnızca
 * kullanıcı dışa aktar'a bastığında yüklenir, uygulamanın açılış boyutunu
 * etkilemez.
 *
 * PDF: tarayıcının yazdırma motoru kullanılır (gizli iframe + print).
 * jsPDF tercih edilmedi çünkü varsayılan fontlarıyla Türkçe karakterleri
 * (ş, ğ, İ, ı) bozuk basıyor; düzeltmek için ~300KB'lık bir TTF gömmek
 * gerekiyordu. Yazdırma yolu sıfır bağımlılık ve kusursuz Türkçe veriyor;
 * kullanıcı tarayıcı diyalogunda "PDF olarak kaydet" seçer.
 */

export type SutunTip = "metin" | "para" | "sayi" | "tarih"

export interface RaporSutun {
  baslik: string
  alan: string
  tip?: SutunTip
  genislik?: number
}

export interface RaporSayfa {
  ad: string
  sutunlar: RaporSutun[]
  satirlar: Record<string, string | number | null>[]
  /** alan → toplam. Verilirse tabloların altına toplam satırı eklenir. */
  toplamlar?: Record<string, number>
}

const paraFormat = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" })
const sayiFormat = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 })

function hucreMetni(deger: string | number | null, tip: SutunTip = "metin") {
  if (deger === null || deger === undefined || deger === "") return ""
  if (tip === "para") return paraFormat.format(Number(deger))
  if (tip === "sayi") return sayiFormat.format(Number(deger))
  if (tip === "tarih") return new Date(String(deger)).toLocaleDateString("tr-TR")
  return String(deger)
}

function html(metin: string) {
  return metin.replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c))
}

// ─────────────────────────────────────────────────────────────
// Excel
// ─────────────────────────────────────────────────────────────

export async function exceleAktar(sayfalar: RaporSayfa[], dosyaAdi: string) {
  const ExcelJS = await import("exceljs")
  const wb = new ExcelJS.Workbook()
  wb.created = new Date()

  for (const sayfa of sayfalar) {
    // Excel sayfa adı 31 karakterle sınırlı ve bazı karakterlere izin vermez
    const ws = wb.addWorksheet(sayfa.ad.replace(/[*?:/\\[\]]/g, "-").slice(0, 31))

    ws.columns = sayfa.sutunlar.map(s => ({
      header: s.baslik,
      key: s.alan,
      width: s.genislik ?? Math.max(12, s.baslik.length + 4),
    }))

    ws.getRow(1).font = { bold: true }
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEEEEEE" } }

    for (const satir of sayfa.satirlar) {
      ws.addRow(satir)
    }

    // Sayısal sütunlara format ver
    sayfa.sutunlar.forEach((s, i) => {
      if (s.tip === "para") ws.getColumn(i + 1).numFmt = '#,##0.00 "₺"'
      else if (s.tip === "sayi") ws.getColumn(i + 1).numFmt = "#,##0.###"
      else if (s.tip === "tarih") ws.getColumn(i + 1).numFmt = "dd.mm.yyyy"
    })

    if (sayfa.toplamlar) {
      const satir: Record<string, string | number> = {}
      const ilkAlan = sayfa.sutunlar[0]?.alan
      if (ilkAlan) satir[ilkAlan] = "TOPLAM"
      for (const [alan, deger] of Object.entries(sayfa.toplamlar)) satir[alan] = deger
      const eklenen = ws.addRow(satir)
      eklenen.font = { bold: true }
      eklenen.border = { top: { style: "double" } }
    }

    ws.views = [{ state: "frozen", ySplit: 1 }]
  }

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${dosyaAdi}.xlsx`
  a.click()
  // Tarayıcının indirmeyi başlatmasına fırsat ver
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ─────────────────────────────────────────────────────────────
// PDF (yazdırma)
// ─────────────────────────────────────────────────────────────

function sayfaTablosu(sayfa: RaporSayfa) {
  const basliklar = sayfa.sutunlar
    .map(s => `<th class="${s.tip === "para" || s.tip === "sayi" ? "sag" : ""}">${html(s.baslik)}</th>`)
    .join("")

  const govde = sayfa.satirlar.map(satir => {
    const hucreler = sayfa.sutunlar.map(s => {
      const sagMi = s.tip === "para" || s.tip === "sayi"
      return `<td class="${sagMi ? "sag" : ""}">${html(hucreMetni(satir[s.alan], s.tip))}</td>`
    }).join("")
    return `<tr>${hucreler}</tr>`
  }).join("")

  const toplamSatiri = sayfa.toplamlar
    ? `<tfoot><tr>${sayfa.sutunlar.map((s, i) => {
        if (i === 0) return `<td><strong>TOPLAM</strong></td>`
        const deger = sayfa.toplamlar![s.alan]
        const sagMi = s.tip === "para" || s.tip === "sayi"
        return `<td class="${sagMi ? "sag" : ""}"><strong>${deger != null ? html(hucreMetni(deger, s.tip)) : ""}</strong></td>`
      }).join("")}</tr></tfoot>`
    : ""

  return `
    <section>
      <h2>${html(sayfa.ad)}</h2>
      ${sayfa.satirlar.length === 0
        ? `<p class="bos">Bu bölümde kayıt yok.</p>`
        : `<table><thead><tr>${basliklar}</tr></thead><tbody>${govde}</tbody>${toplamSatiri}</table>`}
    </section>`
}

export function pdfeAktar(baslik: string, altBaslik: string, sayfalar: RaporSayfa[]) {
  const belge = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><title>${html(baslik)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 10pt; color: #111; margin: 0;
  }
  header { border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 16px; }
  h1 { font-size: 15pt; margin: 0 0 2px; }
  .alt { font-size: 9pt; color: #555; }
  section { margin-bottom: 18px; page-break-inside: auto; }
  h2 { font-size: 11pt; margin: 0 0 6px; padding-bottom: 3px; border-bottom: 1px solid #ccc; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead { display: table-header-group; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #ddd; text-align: left; }
  th { background: #f0f0f0; font-weight: 600; }
  .sag { text-align: right; white-space: nowrap; }
  tfoot td { border-top: 2px solid #111; border-bottom: none; }
  tr { page-break-inside: avoid; }
  .bos { font-size: 9pt; color: #777; font-style: italic; }
  footer { margin-top: 20px; font-size: 8pt; color: #777; text-align: right; }
</style></head>
<body>
  <header>
    <h1>${html(baslik)}</h1>
    <div class="alt">${html(altBaslik)}</div>
  </header>
  ${sayfalar.map(sayfaTablosu).join("")}
  <footer>Oluşturulma: ${new Date().toLocaleString("tr-TR")}</footer>
</body></html>`

  // Açılır pencere engelleyicilerine takılmamak için iframe kullanılır
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0",
    width: "0", height: "0", border: "0", visibility: "hidden",
  })
  document.body.appendChild(iframe)

  const doc = iframe.contentDocument
  if (!doc) { iframe.remove(); return }
  doc.open()
  doc.write(belge)
  doc.close()

  const yazdir = () => {
    iframe.contentWindow?.focus()
    iframe.contentWindow?.print()
    // Yazdırma diyaloğu kapanınca temizle
    setTimeout(() => iframe.remove(), 60000)
  }
  if (doc.readyState === "complete") yazdir()
  else iframe.onload = yazdir
}
