import { useEffect, useState } from "react"
import { Loader2, FileSpreadsheet, Printer, BarChart3 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useSirket } from "@/contexts/SirketContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency } from "@/lib/utils"
import { exceleAktar, pdfeAktar, type RaporSayfa } from "@/lib/rapor"

interface IslemSatir {
  id: string
  tarih: string
  vade_tarihi: string | null
  aciklama: string
  tur: "gelir" | "gider"
  kategori: string
  tutar: number
  nakliye_tutari: number | null
  kdv_tutari: number
  faturali: boolean
  fatura_no: string | null
  cari_id: string | null
  transfer_eslesme_id: string | null
}

const RAPORLAR = [
  { id: "gelir_tablosu", ad: "Gelir Tablosu", aciklama: "Kategori kırılımlı gelir, gider ve net kâr" },
  { id: "kdv", ad: "KDV Raporu", aciklama: "Aylık hesaplanan, indirilecek ve net KDV" },
  { id: "cari_yaslandirma", ad: "Cari Yaşlandırma", aciklama: "Cari bazında vadesi geçen alacak dağılımı" },
  { id: "islem_dokumu", ad: "İşlem Dökümü", aciklama: "Seçilen dönemdeki tüm işlemlerin detayı" },
] as const

type RaporId = typeof RAPORLAR[number]["id"]

export function Raporlar() {
  const { aktifSirketId, aktifSirket } = useSirket()
  const [islemler, setIslemler] = useState<IslemSatir[]>([])
  const [odenenMap, setOdenenMap] = useState<Map<string, number>>(new Map())
  const [cariAdMap, setCariAdMap] = useState<Map<string, string>>(new Map())
  const [loading, setLoading] = useState(true)
  const [aktarilan, setAktarilan] = useState<string | null>(null)

  const buAy = new Date()
  const [baslangic, setBaslangic] = useState(
    new Date(buAy.getFullYear(), 0, 1).toISOString().slice(0, 10))
  const [bitis, setBitis] = useState(new Date().toISOString().slice(0, 10))

  async function load() {
    if (!aktifSirketId) return
    setLoading(true)
    const [{ data: islemData }, { data: odemeData }, { data: cariData }] = await Promise.all([
      supabase.from("islemler")
        .select("id, tarih, vade_tarihi, aciklama, tur, kategori, tutar, nakliye_tutari, kdv_tutari, faturali, fatura_no, cari_id, transfer_eslesme_id")
        .eq("sirket_id", aktifSirketId)
        .order("tarih", { ascending: false }),
      supabase.from("odemeler").select("islem_id, tutar").eq("sirket_id", aktifSirketId),
      supabase.from("cariler").select("id, unvan").eq("sirket_id", aktifSirketId),
    ])

    setIslemler((islemData ?? []) as IslemSatir[])
    const oMap = new Map<string, number>()
    for (const o of (odemeData ?? []) as { islem_id: string; tutar: number }[]) {
      oMap.set(o.islem_id, (oMap.get(o.islem_id) ?? 0) + o.tutar)
    }
    setOdenenMap(oMap)
    setCariAdMap(new Map(((cariData ?? []) as { id: string; unvan: string }[]).map(c => [c.id, c.unvan])))
    setLoading(false)
  }

  useEffect(() => { load() }, [aktifSirketId])

  // Transferler gelir/gider değildir; raporların hiçbirine girmez.
  const donem = islemler.filter(i =>
    i.transfer_eslesme_id == null && i.tarih >= baslangic && i.tarih <= bitis)

  const islemToplam = (i: IslemSatir) => i.tutar + (i.nakliye_tutari ?? 0)

  // ── Rapor verileri ────────────────────────────────────────
  function gelirTablosu(): RaporSayfa[] {
    const grupla = (tur: "gelir" | "gider") => {
      const map = new Map<string, { tutar: number; adet: number }>()
      for (const i of donem.filter(x => x.tur === tur)) {
        const e = map.get(i.kategori) ?? { tutar: 0, adet: 0 }
        e.tutar += islemToplam(i); e.adet += 1
        map.set(i.kategori, e)
      }
      return Array.from(map.entries())
        .sort((a, b) => b[1].tutar - a[1].tutar)
        .map(([kategori, v]) => ({ kategori, adet: v.adet, tutar: v.tutar }))
    }

    const gelirler = grupla("gelir")
    const giderler = grupla("gider")
    const gelirToplam = gelirler.reduce((s, r) => s + r.tutar, 0)
    const giderToplam = giderler.reduce((s, r) => s + r.tutar, 0)

    const sutunlar = [
      { baslik: "Kategori", alan: "kategori", genislik: 28 },
      { baslik: "İşlem Sayısı", alan: "adet", tip: "sayi" as const },
      { baslik: "Tutar", alan: "tutar", tip: "para" as const, genislik: 18 },
    ]

    return [
      { ad: "Gelirler", sutunlar, satirlar: gelirler, toplamlar: { tutar: gelirToplam } },
      { ad: "Giderler", sutunlar, satirlar: giderler, toplamlar: { tutar: giderToplam } },
      {
        ad: "Özet",
        sutunlar: [
          { baslik: "Kalem", alan: "kalem", genislik: 28 },
          { baslik: "Tutar", alan: "tutar", tip: "para" as const, genislik: 18 },
        ],
        satirlar: [
          { kalem: "Toplam Gelir", tutar: gelirToplam },
          { kalem: "Toplam Gider", tutar: giderToplam },
          { kalem: "Net Kâr / Zarar", tutar: gelirToplam - giderToplam },
        ],
      },
    ]
  }

  function kdvRaporu(): RaporSayfa[] {
    const map = new Map<string, { hesaplanan: number; indirilecek: number; faturasiz: number }>()
    for (const i of donem) {
      const kdv = i.kdv_tutari ?? 0
      if (kdv <= 0) continue
      const key = i.tarih.slice(0, 7)
      const e = map.get(key) ?? { hesaplanan: 0, indirilecek: 0, faturasiz: 0 }
      if (i.tur === "gelir") e.hesaplanan += kdv
      else if (i.faturali) e.indirilecek += kdv
      else e.faturasiz += kdv
      map.set(key, e)
    }
    const satirlar = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, v]) => ({
        ay: new Date(key + "-02").toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
        hesaplanan: v.hesaplanan,
        indirilecek: v.indirilecek,
        net: v.hesaplanan - v.indirilecek,
        faturasiz: v.faturasiz,
      }))

    return [{
      ad: "KDV Özeti",
      sutunlar: [
        { baslik: "Ay", alan: "ay", genislik: 20 },
        { baslik: "Hesaplanan KDV", alan: "hesaplanan", tip: "para", genislik: 18 },
        { baslik: "İndirilecek KDV", alan: "indirilecek", tip: "para", genislik: 18 },
        { baslik: "Net KDV", alan: "net", tip: "para", genislik: 16 },
        { baslik: "Faturasız (indirilemez)", alan: "faturasiz", tip: "para", genislik: 22 },
      ],
      satirlar,
      toplamlar: {
        hesaplanan: satirlar.reduce((s, r) => s + r.hesaplanan, 0),
        indirilecek: satirlar.reduce((s, r) => s + r.indirilecek, 0),
        net: satirlar.reduce((s, r) => s + r.net, 0),
        faturasiz: satirlar.reduce((s, r) => s + r.faturasiz, 0),
      },
    }]
  }

  function cariYaslandirma(): RaporSayfa[] {
    const bugun = new Date().toISOString().slice(0, 10)
    const kova = (vade: string | null) => {
      if (!vade || vade >= bugun) return "vadesiGelmemis"
      const gun = Math.floor((new Date(bugun).getTime() - new Date(vade).getTime()) / 86400000)
      if (gun <= 30) return "g30"
      if (gun <= 60) return "g60"
      if (gun <= 90) return "g90"
      return "g90plus"
    }

    const map = new Map<string, Record<string, number>>()
    // Tüm zamanlardaki açık bakiyeler — yaşlandırma dönemle sınırlanmaz
    for (const i of islemler) {
      if (i.transfer_eslesme_id != null || i.tur !== "gelir" || !i.cari_id) continue
      const kalan = islemToplam(i) - (odenenMap.get(i.id) ?? 0)
      if (kalan <= 0.005) continue
      const ad = cariAdMap.get(i.cari_id) ?? "—"
      const e = map.get(ad) ?? { vadesiGelmemis: 0, g30: 0, g60: 0, g90: 0, g90plus: 0, toplam: 0 }
      e[kova(i.vade_tarihi)] += kalan
      e.toplam += kalan
      map.set(ad, e)
    }

    const satirlar = Array.from(map.entries())
      .sort((a, b) => b[1].toplam - a[1].toplam)
      .map(([cari, v]) => ({ cari, ...v }))

    const topla = (alan: string) =>
      satirlar.reduce((s, r) => s + Number(r[alan as keyof typeof r] ?? 0), 0)

    return [{
      ad: "Cari Yaşlandırma",
      sutunlar: [
        { baslik: "Cari", alan: "cari", genislik: 30 },
        { baslik: "Vadesi Gelmemiş", alan: "vadesiGelmemis", tip: "para", genislik: 18 },
        { baslik: "0-30 Gün", alan: "g30", tip: "para", genislik: 15 },
        { baslik: "31-60 Gün", alan: "g60", tip: "para", genislik: 15 },
        { baslik: "61-90 Gün", alan: "g90", tip: "para", genislik: 15 },
        { baslik: "90+ Gün", alan: "g90plus", tip: "para", genislik: 15 },
        { baslik: "Toplam", alan: "toplam", tip: "para", genislik: 18 },
      ],
      satirlar,
      toplamlar: {
        vadesiGelmemis: topla("vadesiGelmemis"), g30: topla("g30"), g60: topla("g60"),
        g90: topla("g90"), g90plus: topla("g90plus"), toplam: topla("toplam"),
      },
    }]
  }

  function islemDokumu(): RaporSayfa[] {
    const satirlar = [...donem]
      .sort((a, b) => a.tarih.localeCompare(b.tarih))
      .map(i => {
        const toplam = islemToplam(i)
        const odenen = odenenMap.get(i.id) ?? 0
        return {
          tarih: i.tarih,
          tur: i.tur === "gelir" ? "Gelir" : "Gider",
          kategori: i.kategori,
          aciklama: i.aciklama,
          cari: i.cari_id ? (cariAdMap.get(i.cari_id) ?? "") : "",
          fatura_no: i.fatura_no ?? "",
          faturali: i.faturali ? "Evet" : "Hayır",
          matrah: toplam - (i.kdv_tutari ?? 0),
          kdv: i.kdv_tutari ?? 0,
          tutar: toplam,
          odenen,
          kalan: toplam - odenen,
        }
      })

    const topla = (alan: string) =>
      satirlar.reduce((s, r) => s + Number(r[alan as keyof typeof r] ?? 0), 0)

    return [{
      ad: "İşlem Dökümü",
      sutunlar: [
        { baslik: "Tarih", alan: "tarih", tip: "tarih", genislik: 12 },
        { baslik: "Tür", alan: "tur", genislik: 8 },
        { baslik: "Kategori", alan: "kategori", genislik: 16 },
        { baslik: "Açıklama", alan: "aciklama", genislik: 34 },
        { baslik: "Cari", alan: "cari", genislik: 24 },
        { baslik: "Fatura No", alan: "fatura_no", genislik: 16 },
        { baslik: "Faturalı", alan: "faturali", genislik: 9 },
        { baslik: "Matrah", alan: "matrah", tip: "para", genislik: 15 },
        { baslik: "KDV", alan: "kdv", tip: "para", genislik: 14 },
        { baslik: "Toplam", alan: "tutar", tip: "para", genislik: 15 },
        { baslik: "Ödenen", alan: "odenen", tip: "para", genislik: 15 },
        { baslik: "Kalan", alan: "kalan", tip: "para", genislik: 15 },
      ],
      satirlar,
      toplamlar: {
        matrah: topla("matrah"), kdv: topla("kdv"), tutar: topla("tutar"),
        odenen: topla("odenen"), kalan: topla("kalan"),
      },
    }]
  }

  function raporVerisi(id: RaporId): RaporSayfa[] {
    if (id === "gelir_tablosu") return gelirTablosu()
    if (id === "kdv") return kdvRaporu()
    if (id === "cari_yaslandirma") return cariYaslandirma()
    return islemDokumu()
  }

  const donemMetni = `${new Date(baslangic).toLocaleDateString("tr-TR")} – ${new Date(bitis).toLocaleDateString("tr-TR")}`

  async function excel(id: RaporId, ad: string) {
    setAktarilan(`${id}-excel`)
    try {
      await exceleAktar(raporVerisi(id), `${ad} ${baslangic}_${bitis}`.replace(/[^\wğüşiöçĞÜŞİÖÇ .-]/gi, ""))
    } catch (e) {
      alert("Excel oluşturulamadı: " + (e instanceof Error ? e.message : String(e)))
    } finally {
      setAktarilan(null)
    }
  }

  function pdf(id: RaporId, ad: string) {
    const alt = `${aktifSirket?.ad ?? ""} · Dönem: ${donemMetni}`
    pdfeAktar(ad, alt, raporVerisi(id))
  }

  // Ekranda hızlı bakış için birkaç rakam
  const gelirToplam = donem.filter(i => i.tur === "gelir").reduce((s, i) => s + islemToplam(i), 0)
  const giderToplam = donem.filter(i => i.tur === "gider").reduce((s, i) => s + islemToplam(i), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Raporlar</h1>
        <p className="text-muted-foreground text-sm">Dönem seçip Excel veya PDF olarak dışa aktarın</p>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-sm font-semibold">Dönem</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Başlangıç</Label>
              <Input type="date" value={baslangic} onChange={e => setBaslangic(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Bitiş</Label>
              <Input type="date" value={bitis} onChange={e => setBitis(e.target.value)} />
            </div>
            <div className="text-sm">
              {loading ? (
                <span className="text-muted-foreground">Yükleniyor...</span>
              ) : (
                <div className="space-y-0.5">
                  <p className="text-muted-foreground text-xs">{donem.length} işlem</p>
                  <p>
                    <span className="text-green-600 font-medium">{formatCurrency(gelirToplam)}</span>
                    {" − "}
                    <span className="text-red-500 font-medium">{formatCurrency(giderToplam)}</span>
                    {" = "}
                    <span className={`font-semibold ${gelirToplam - giderToplam >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {formatCurrency(gelirToplam - giderToplam)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {RAPORLAR.map(r => (
          <Card key={r.id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <BarChart3 className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-sm">{r.ad}</p>
                  <p className="text-xs text-muted-foreground">{r.aciklama}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline" size="sm" className="flex-1"
                  disabled={loading || aktarilan === `${r.id}-excel`}
                  onClick={() => excel(r.id, r.ad)}
                >
                  {aktarilan === `${r.id}-excel`
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <FileSpreadsheet className="h-4 w-4" />}
                  Excel
                </Button>
                <Button
                  variant="outline" size="sm" className="flex-1"
                  disabled={loading}
                  onClick={() => pdf(r.id, r.ad)}
                >
                  <Printer className="h-4 w-4" />
                  PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <p>
          <strong>PDF:</strong> Yazdırma penceresi açılır — hedef olarak
          <strong> "PDF olarak kaydet"</strong> seçin. Böylece Türkçe karakterler
          eksiksiz çıkar ve dosya tarayıcının kendi motoruyla üretilir.
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Cari Yaşlandırma raporu, dönemden bağımsız olarak <strong>tüm açık alacakları</strong> gösterir —
        vadesi geçmiş bakiye dönem filtresiyle gizlenmesin diye. Diğer raporlar seçilen dönemle sınırlıdır.
        Hesaplar arası transferler hiçbir rapora dahil edilmez.
      </p>
    </div>
  )
}
