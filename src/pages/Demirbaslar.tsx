import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, User, Info, Banknote, ChevronDown, ChevronRight } from "lucide-react"
import { supabase, type Demirbase, type AppUser, type DemirbasGrubu } from "@/lib/supabase"
import { useSirket } from "@/contexts/SirketContext"
import { DemirbasSatisDialog } from "./DemirbasSatisDialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"

const KATEGORILER = ["Bilgisayar", "Mobilya", "Araç", "Ekipman", "Yazılım", "Diğer"]
const DURUMLAR = [
  { value: "aktif", label: "Aktif" },
  { value: "bakimda", label: "Bakımda" },
  { value: "hurda", label: "Hurda" },
  { value: "devredildi", label: "Devredildi" },
  { value: "satildi", label: "Satıldı" },
]
const DURUM_VARIANT: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  aktif: "success",
  bakimda: "warning",
  hurda: "destructive",
  devredildi: "outline",
  satildi: "outline",
}
/** Artık elde olmayan demirbaşlar — envanter toplamlarına girmez. */
const ELDEN_CIKAN = ["satildi", "hurda", "devredildi"]

/** Ayrı kaydedilen eşyalardaki "#N" ekini atar: "Sandalye #3" → "Sandalye" */
function cinsAdi(ad: string) {
  return ad.replace(/\s*#\d+\s*$/, "").trim() || ad
}

interface KaynakIslem { tutar: number; tarih: string }
type DemirbasRow = Demirbase & { kaynak_islem: KaynakIslem | null }

const defaultForm = {
  ad: "", kategori: "Bilgisayar", marka: "", model: "", seri_no: "", adet: "1",
  grup_id: "", grup_adi: "", ayriKaydet: false,
  alis_tarihi: "", alis_fiyati: "", konum: "", durum: "aktif" as Demirbase["durum"],
  zimmet_kullanici_id: "", zimmet_tarihi: "",
  garanti_bitis: "", son_bakim_tarihi: "", sonraki_bakim_tarihi: "", notlar: "",
}

export function Demirbaslar() {
  const { aktifSirketId, isSirketAdmin: isAdmin } = useSirket()
  const [kayitlar, setKayitlar] = useState<DemirbasRow[]>([])
  const [kullanicilar, setKullanicilar] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [satisDemirbas, setSatisDemirbas] = useState<DemirbasRow | null>(null)
  const [gruplar, setGruplar] = useState<DemirbasGrubu[]>([])
  const [duzenlenenGrup, setDuzenlenenGrup] = useState<{ grup: DemirbasGrubu; items: DemirbasRow[] } | null>(null)
  const [grupForm, setGrupForm] = useState({
    ad: "", tarih: "", adet: "1",
    ekipmanAd: "", kategori: "Bilgisayar", marka: "", model: "", konum: "",
    alis_fiyati: "", garanti_bitis: "",
  })
  const [grupSaving, setGrupSaving] = useState(false)
  const [grupError, setGrupError] = useState<string | null>(null)
  // Kapalı olanları tutuyoruz ki yeni/yeniden adlandırılan gruplar açık gelsin.
  const [kapaliGruplar, setKapaliGruplar] = useState<Set<string>>(new Set())
  const [silinecekGrup, setSilinecekGrup] = useState<{ grup: DemirbasGrubu; adet: number } | null>(null)
  const [grupSiliniyor, setGrupSiliniyor] = useState(false)
  const [editing, setEditing] = useState<DemirbasRow | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [filterKat, setFilterKat] = useState("tumu")
  const [filterDurum, setFilterDurum] = useState("tumu")
  const [search, setSearch] = useState("")

  async function load() {
    if (!aktifSirketId) return
    setLoading(true)
    const [{ data: db }, { data: ku }, { data: gr }] = await Promise.all([
      supabase.from("demirbaslar").select("*, kaynak_islem:islemler!kaynak_islem_id(tutar, tarih)").eq("sirket_id", aktifSirketId).order("ad"),
      supabase.from("kullanicilar").select("*").eq("aktif", true).order("ad_soyad"),
      supabase.from("demirbas_gruplari").select("*").eq("sirket_id", aktifSirketId)
        .order("tarih", { ascending: false, nullsFirst: false }).order("ad"),
    ])
    setGruplar((gr ?? []) as DemirbasGrubu[])
    setKayitlar((db ?? []) as DemirbasRow[])
    setKullanicilar((ku ?? []) as AppUser[])
    setLoading(false)
  }

  useEffect(() => { load() }, [aktifSirketId])

  function f(field: string, value: string) { setForm(p => ({ ...p, [field]: value })) }

  function openNew() { setEditing(null); setForm(defaultForm); setDialogOpen(true) }

  function openEdit(d: DemirbasRow) {
    setEditing(d)
    // alis_fiyati BİRİM fiyattır; işlemin toplam tutarı adede bölünerek yazılır.
    const alisFiyati = d.alis_fiyati != null ? String(d.alis_fiyati) : ""
    const alisTarihi = d.kaynak_islem ? d.kaynak_islem.tarih : (d.alis_tarihi ?? "")
    setForm({
      ad: d.ad, kategori: d.kategori, marka: d.marka ?? "", model: d.model ?? "",
      seri_no: d.seri_no ?? "", adet: String(d.adet ?? 1),
      grup_id: d.grup_id ?? "", grup_adi: "", ayriKaydet: false,
      alis_tarihi: alisTarihi,
      alis_fiyati: alisFiyati,
      konum: d.konum ?? "", durum: d.durum,
      zimmet_kullanici_id: d.zimmet_kullanici_id ?? "",
      zimmet_tarihi: d.zimmet_tarihi ?? "",
      garanti_bitis: d.garanti_bitis ?? "",
      son_bakim_tarihi: d.son_bakim_tarihi ?? "",
      sonraki_bakim_tarihi: d.sonraki_bakim_tarihi ?? "",
      notlar: d.notlar ?? "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.ad) return
    setSaving(true)
    const adet = Math.max(1, parseInt(form.adet) || 1)
    const ayriKayitlar = !editing && form.ayriKaydet && adet > 1
    const payload = {
      ad: form.ad, kategori: form.kategori,
      marka: form.marka || null, model: form.model || null,
      seri_no: form.seri_no || null,
      adet,
      grup_id: form.grup_id || null,
      alis_tarihi: form.alis_tarihi || null,
      alis_fiyati: form.alis_fiyati ? parseFloat(form.alis_fiyati) : null,
      konum: form.konum || null, durum: form.durum,
      zimmet_kullanici_id: form.zimmet_kullanici_id || null,
      zimmet_tarihi: form.zimmet_tarihi || null,
      garanti_bitis: form.garanti_bitis || null,
      son_bakim_tarihi: form.son_bakim_tarihi || null,
      sonraki_bakim_tarihi: form.sonraki_bakim_tarihi || null,
      notlar: form.notlar || null,
      updated_at: new Date().toISOString(),
    }
    // Grup adı verildiyse bu giriş için yeni bir parti oluşturulur.
    if (!editing && form.grup_adi.trim()) {
      const { data: g, error: gErr } = await supabase.from("demirbas_gruplari").insert({
        sirket_id: aktifSirketId,
        ad: form.grup_adi.trim(),
        tarih: form.alis_tarihi || null,
        ayri_kayit: ayriKayitlar,
      }).select("id").single()
      if (gErr) { setSaving(false); alert("Grup oluşturulamadı: " + gErr.message); return }
      payload.grup_id = g.id
    }

    if (editing) {
      await supabase.from("demirbaslar").update(payload).eq("id", editing.id)
    } else if (ayriKayitlar) {
      // Her eşya ayrı satır: seri no / zimmet / durum tek tek izlenebilsin.
      await supabase.from("demirbaslar").insert(
        Array.from({ length: adet }, (_, i) => ({
          ...payload,
          ad: `${form.ad} #${i + 1}`,
          adet: 1,
          sirket_id: aktifSirketId,
        }))
      )
    } else {
      await supabase.from("demirbaslar").insert({ ...payload, sirket_id: aktifSirketId })
    }
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  function openGrupEdit(grup: DemirbasGrubu, items: DemirbasRow[]) {
    const ilk = items[0]
    const mevcutAdet = grup.ayri_kayit ? items.length : (ilk?.adet ?? 1)
    setDuzenlenenGrup({ grup, items })
    setGrupForm({
      ad: grup.ad,
      tarih: grup.tarih ?? "",
      adet: String(mevcutAdet),
      ekipmanAd: ilk ? cinsAdi(ilk.ad) : "",
      kategori: ilk?.kategori ?? "Bilgisayar",
      marka: ilk?.marka ?? "",
      model: ilk?.model ?? "",
      konum: ilk?.konum ?? "",
      alis_fiyati: ilk?.alis_fiyati != null ? String(ilk.alis_fiyati) : "",
      garanti_bitis: ilk?.garanti_bitis ?? "",
    })
    setGrupError(null)
  }

  /**
   * Partiyi yeniden düzenler: ortak alanlar üyelere yazılır, adet fazlaysa
   * kayıt silinir, eksikse kayıt eklenir.
   * Seri no, zimmet, durum ve bakım alanları eşyaya özeldir — korunur.
   */
  async function handleGrupSave() {
    if (!duzenlenenGrup) return
    if (!grupForm.ad.trim()) { setGrupError("Grup adı zorunludur."); return }
    const hedefAdet = Math.max(1, parseInt(grupForm.adet) || 1)
    const { grup, items } = duzenlenenGrup

    setGrupSaving(true)
    setGrupError(null)

    try {
      const { error: gErr } = await supabase.from("demirbas_gruplari").update({
        ad: grupForm.ad.trim(),
        tarih: grupForm.tarih || null,
      }).eq("id", grup.id)
      if (gErr) { setGrupError(gErr.message); return }

      // Üyelere yazılacak ortak alanlar
      const ortak = {
        kategori: grupForm.kategori,
        marka: grupForm.marka || null,
        model: grupForm.model || null,
        konum: grupForm.konum || null,
        alis_fiyati: grupForm.alis_fiyati ? parseFloat(grupForm.alis_fiyati) : null,
        alis_tarihi: grupForm.tarih || null,
        garanti_bitis: grupForm.garanti_bitis || null,
        updated_at: new Date().toISOString(),
      }

      let kalanlar = [...items]

      if (grup.ayri_kayit) {
        const fazla = items.length - hedefAdet
        if (fazla > 0) {
          // Önce üzerinde çalışılmamış olanları sil (seri no / zimmet yoksa), sonra en yeniler.
          const silinecek = [...items].sort((a, b) => {
            const aIz = (a.seri_no ? 1 : 0) + (a.zimmet_kullanici_id ? 1 : 0)
            const bIz = (b.seri_no ? 1 : 0) + (b.zimmet_kullanici_id ? 1 : 0)
            if (aIz !== bIz) return aIz - bIz
            return (b.created_at ?? "").localeCompare(a.created_at ?? "")
          }).slice(0, fazla)
          const { error } = await supabase.from("demirbaslar").delete().in("id", silinecek.map(d => d.id))
          if (error) { setGrupError(error.message); return }
          const silinenId = new Set(silinecek.map(d => d.id))
          kalanlar = items.filter(d => !silinenId.has(d.id))
        } else if (fazla < 0) {
          const eklenecek = Array.from({ length: -fazla }, () => ({
            ...ortak,
            ad: grupForm.ekipmanAd,
            adet: 1,
            durum: "aktif" as const,
            grup_id: grup.id,
            sirket_id: aktifSirketId,
          }))
          const { error } = await supabase.from("demirbaslar").insert(eklenecek)
          if (error) { setGrupError(error.message); return }
        }

        // Kalanları güncelle ve yeniden numaralandır
        for (let i = 0; i < kalanlar.length; i++) {
          const { error } = await supabase.from("demirbaslar")
            .update({ ...ortak, ad: `${grupForm.ekipmanAd} #${i + 1}`, adet: 1 })
            .eq("id", kalanlar[i].id)
          if (error) { setGrupError(error.message); return }
        }
      } else {
        // Tek kayıtlı parti: adet doğrudan kaydın adet alanıdır.
        for (const d of items) {
          const { error } = await supabase.from("demirbaslar")
            .update({ ...ortak, ad: grupForm.ekipmanAd, adet: hedefAdet })
            .eq("id", d.id)
          if (error) { setGrupError(error.message); return }
        }
      }

      setDuzenlenenGrup(null)
      load()
    } catch (e) {
      setGrupError(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.")
    } finally {
      setGrupSaving(false)
    }
  }

  function grupAcKapa(anahtar: string) {
    setKapaliGruplar(prev => {
      const next = new Set(prev)
      if (next.has(anahtar)) next.delete(anahtar)
      else next.add(anahtar)
      return next
    })
  }

  /** Yalnızca grubu siler; demirbaşlar "Gruplanmamış"a düşer (FK ON DELETE SET NULL). */
  async function grubuSil() {
    if (!silinecekGrup) return
    setGrupSiliniyor(true)
    const { error } = await supabase.from("demirbas_gruplari").delete().eq("id", silinecekGrup.grup.id)
    setGrupSiliniyor(false)
    if (error) { alert("Silme hatası: " + error.message); return }
    setSilinecekGrup(null)
    load()
  }

  /** Grubu ve içindeki tüm demirbaşları siler. */
  async function grubuVeKayitlariSil() {
    if (!silinecekGrup) return
    setGrupSiliniyor(true)
    // Demirbaş silme trigger'ı bağlı alış işlemini de siler (fn_demirbaş_sil_islem).
    const { error: dErr } = await supabase.from("demirbaslar").delete().eq("grup_id", silinecekGrup.grup.id)
    if (dErr) { setGrupSiliniyor(false); alert("Silme hatası: " + dErr.message); return }
    const { error } = await supabase.from("demirbas_gruplari").delete().eq("id", silinecekGrup.grup.id)
    setGrupSiliniyor(false)
    if (error) { alert("Grup silinemedi: " + error.message); return }
    setSilinecekGrup(null)
    load()
  }

  async function handleDelete(d: DemirbasRow) {
    const msg = d.kaynak_islem
      ? "Bu demirbaşı silmek istediğinize emin misiniz?\nBağlı gider kaydı da silinecektir."
      : "Bu demirbaş kaydını silmek istediğinize emin misiniz?"
    if (!confirm(msg)) return
    await supabase.from("demirbaslar").delete().eq("id", d.id)
    load()
  }

  const today = new Date().toISOString().slice(0, 10)

  const filtered = kayitlar.filter(d => {
    const matchSearch = !search ||
      d.ad.toLowerCase().includes(search.toLowerCase()) ||
      (d.seri_no ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (d.marka ?? "").toLowerCase().includes(search.toLowerCase())
    const matchKat = filterKat === "tumu" || d.kategori === filterKat
    const matchDurum = filterDurum === "tumu" || d.durum === filterDurum
    return matchSearch && matchKat && matchDurum
  })

  const esyaSayisi = (items: DemirbasRow[]) => items.reduce((s, d) => s + (d.adet ?? 1), 0)
  const toplamTutar = (items: DemirbasRow[]) => items.reduce((s, d) => s + (d.alis_fiyati ?? 0) * (d.adet ?? 1), 0)

  // Sabit hiyerarşi: Kategori → Cins → Grup → kayıtlar.
  // Cins, ayrı kaydedilen eşyalardaki "#N" eki atılarak bulunur; böylece
  // "Sandalye #1..#10" ve sonraki "Sandalye" alımları aynı cins altında toplanır.
  const agac = (() => {
    const grupById = new Map(gruplar.map(g => [g.id, g]))
    const katMap = new Map<string, Map<string, Map<string, DemirbasRow[]>>>()

    for (const d of filtered) {
      const kat = d.kategori || "Diğer"
      const cins = cinsAdi(d.ad)
      const grupKey = d.grup_id ?? ""
      if (!katMap.has(kat)) katMap.set(kat, new Map())
      const cinsMap = katMap.get(kat)!
      if (!cinsMap.has(cins)) cinsMap.set(cins, new Map())
      const grupMap = cinsMap.get(cins)!
      grupMap.set(grupKey, [...(grupMap.get(grupKey) ?? []), d])
    }

    const trSirala = (a: string, b: string) => a.localeCompare(b, "tr")

    return Array.from(katMap.entries())
      .sort((a, b) => trSirala(a[0], b[0]))
      .map(([kategori, cinsMap]) => {
        const cinsler = Array.from(cinsMap.entries())
          .sort((a, b) => trSirala(a[0], b[0]))
          .map(([cins, grupMap]) => {
            const gruplarListe = Array.from(grupMap.entries())
              // Gruplanmamış en sona
              .sort((a, b) => a[0] === "" ? 1 : b[0] === "" ? -1 : trSirala(
                grupById.get(a[0])?.ad ?? "", grupById.get(b[0])?.ad ?? ""))
              .map(([gid, items]) => ({
                grup: gid ? (grupById.get(gid) ?? null) : null,
                items,
              }))
            return {
              cins,
              gruplar: gruplarListe,
              items: gruplarListe.flatMap(g => g.items),
            }
          })
        return { kategori, cinsler, items: cinsler.flatMap(c => c.items) }
      })
  })()

  // Envanter toplamları yalnızca elde olan demirbaşları kapsar.
  // alis_fiyati birim fiyat olduğundan grubun değeri adetle çarpılır.
  const eldekiler = kayitlar.filter(d => !ELDEN_CIKAN.includes(d.durum))
  const toplamDeger = eldekiler.reduce((s, d) => s + (d.alis_fiyati ?? 0) * (d.adet ?? 1), 0)
  const toplamAdet = eldekiler.reduce((s, d) => s + (d.adet ?? 1), 0)
  const satisKarZarar = kayitlar
    .filter(d => d.durum === "satildi" && d.satis_fiyati != null)
    .reduce((s, d) => s + ((d.satis_fiyati ?? 0) - (d.alis_fiyati ?? 0)) * (d.adet ?? 1), 0)
  const satilanVar = kayitlar.some(d => d.durum === "satildi")
  const garantiUyari = kayitlar.filter(d => d.garanti_bitis && d.garanti_bitis <= today && d.durum === "aktif").length
  const bakimUyari = kayitlar.filter(d => d.sonraki_bakim_tarihi && d.sonraki_bakim_tarihi <= today && d.durum === "aktif").length

  function kullaniciBul(id: string | null) {
    return kullanicilar.find(k => k.id === id)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Demirbaşlar</h1>
          <p className="text-muted-foreground text-sm">Sabit kıymet takibi</p>
        </div>
        {isAdmin && (
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4" /> Yeni Demirbaş
          </Button>
        )}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Satın alma kaydı oluşturmak için <strong>Finans → Yeni İşlem → Gider → Demirbaş</strong> kategorisini kullanın. Alış fiyatı ve tarihi otomatik aktarılır.
        </p>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Eldeki Eşya</p>
          <p className="text-lg font-bold">{toplamAdet}</p>
          {toplamAdet !== eldekiler.length && (
            <p className="text-[10px] text-muted-foreground">{eldekiler.length} kayıt</p>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">{satilanVar ? "Satış Kâr/Zarar" : "Toplam Değer"}</p>
          {satilanVar ? (
            <p className={`text-lg font-bold ${satisKarZarar >= 0 ? "text-green-600" : "text-red-500"}`}>
              {satisKarZarar >= 0 ? "+" : ""}{formatCurrency(satisKarZarar)}
            </p>
          ) : (
            <p className="text-lg font-bold">{formatCurrency(toplamDeger)}</p>
          )}
          {satilanVar && (
            <p className="text-[10px] text-muted-foreground">Envanter: {formatCurrency(toplamDeger)}</p>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Garanti Bitti</p>
          <p className={`text-lg font-bold ${garantiUyari > 0 ? "text-orange-500" : "text-muted-foreground"}`}>{garantiUyari}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Bakım Gerekli</p>
          <p className={`text-lg font-bold ${bakimUyari > 0 ? "text-orange-500" : "text-muted-foreground"}`}>{bakimUyari}</p>
        </CardContent></Card>
      </div>

      {/* Filtreler */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Ad, seri no veya marka ara..." value={search} onChange={e => setSearch(e.target.value)} className="sm:max-w-xs" />
            <Select value={filterKat} onValueChange={setFilterKat}>
              <SelectTrigger className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tumu">Tüm Kategoriler</SelectItem>
                {KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterDurum} onValueChange={setFilterDurum}>
              <SelectTrigger className="sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tumu">Tüm Durumlar</SelectItem>
                {DURUMLAR.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button
              variant="outline" size="sm" className="shrink-0"
              onClick={() => {
                if (kapaliGruplar.size > 0) { setKapaliGruplar(new Set()); return }
                // Tüm düğümleri kapat: kategori, cins ve grup seviyeleri
                const hepsi = new Set<string>()
                for (const k of agac) {
                  hepsi.add(k.kategori)
                  for (const c of k.cinsler) {
                    hepsi.add(`${k.kategori}|${c.cins}`)
                    for (const g of c.gruplar) hepsi.add(`${k.kategori}|${c.cins}|${g.grup?.id ?? ""}`)
                  }
                }
                setKapaliGruplar(hepsi)
              }}
            >
              {kapaliGruplar.size > 0 ? "Tümünü Aç" : "Tümünü Kapat"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">Demirbaş bulunamadı</p>
          ) : (
            <div className="space-y-1">
              {agac.map(kat => {
                const katAnahtar = kat.kategori
                const katAcik = !kapaliGruplar.has(katAnahtar)
                return (
                <div key={katAnahtar}>
                  {/* 1. seviye — Kategori */}
                  <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border">
                    <button
                      type="button"
                      onClick={() => grupAcKapa(katAnahtar)}
                      className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:text-primary transition-colors"
                    >
                      {katAcik
                        ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
                      <span className="text-sm font-bold truncate">{kat.kategori}</span>
                    </button>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {esyaSayisi(kat.items)} eşya · {formatCurrency(toplamTutar(kat.items))}
                    </span>
                  </div>

                  {katAcik && kat.cinsler.map(c => {
                    const cinsAnahtar = `${kat.kategori}|${c.cins}`
                    const cinsAcik = !kapaliGruplar.has(cinsAnahtar)
                    return (
                      <div key={cinsAnahtar} className="ml-4">
                        {/* 2. seviye — Cins */}
                        <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/60">
                          <button
                            type="button"
                            onClick={() => grupAcKapa(cinsAnahtar)}
                            className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:text-primary transition-colors"
                          >
                            {cinsAcik
                              ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                            <span className="text-sm font-semibold truncate">{c.cins}</span>
                          </button>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {esyaSayisi(c.items)} eşya · {formatCurrency(toplamTutar(c.items))}
                          </span>
                        </div>

                        {cinsAcik && c.gruplar.map(({ grup, items }) => {
                          const grupAnahtar = `${cinsAnahtar}|${grup?.id ?? ""}`
                          const grupAcik = !kapaliGruplar.has(grupAnahtar)
                          return (
                            <div key={grupAnahtar} className="ml-4">
                              {/* 3. seviye — Grup */}
                              <div className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40">
                                <button
                                  type="button"
                                  onClick={() => grupAcKapa(grupAnahtar)}
                                  className="flex items-center gap-1.5 min-w-0 flex-1 text-left hover:text-primary transition-colors"
                                >
                                  {grupAcik
                                    ? <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                                    : <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />}
                                  <span className={`text-xs truncate ${grup ? "font-medium" : "text-muted-foreground italic"}`}>
                                    {grup?.ad ?? "Gruplanmamış"}
                                  </span>
                                  {grup?.tarih && (
                                    <span className="text-xs text-muted-foreground shrink-0">{formatDate(grup.tarih)}</span>
                                  )}
                                </button>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-muted-foreground">
                                    {esyaSayisi(items)} eşya · {formatCurrency(toplamTutar(items))}
                                  </span>
                                  {isAdmin && grup && (
                                    <>
                                      <Button
                                        variant="ghost" size="icon" className="h-6 w-6"
                                        title="Grubu düzenle"
                                        onClick={() => openGrupEdit(grup, items)}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                      <Button
                                        variant="ghost" size="icon"
                                        className="h-6 w-6 text-destructive hover:text-destructive"
                                        title="Grubu sil"
                                        onClick={() => setSilinecekGrup({ grup, adet: items.length })}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className={`divide-y divide-border ml-4 ${grupAcik ? "" : "hidden"}`}>
              {items.map(d => {
                const zimmetli = kullaniciBul(d.zimmet_kullanici_id)
                const garantiBitti = d.garanti_bitis && d.garanti_bitis <= today
                const bakimGerekli = d.sonraki_bakim_tarihi && d.sonraki_bakim_tarihi <= today
                const fiyat = d.alis_fiyati
                const tarih = d.kaynak_islem?.tarih ?? d.alis_tarihi

                return (
                  <div key={d.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{d.ad}</p>
                        {(d.adet ?? 1) > 1 && (
                          <Badge variant="secondary" className="text-xs">×{d.adet}</Badge>
                        )}
                        <Badge variant={DURUM_VARIANT[d.durum]} className="text-xs">{DURUMLAR.find(x => x.value === d.durum)?.label}</Badge>
                        <Badge variant="outline" className="text-xs">{d.kategori}</Badge>
                        {d.kaynak_islem && <Badge variant="outline" className="text-xs text-blue-500 border-blue-200">Gider bağlı</Badge>}
                        {(garantiBitti || bakimGerekli) && <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                        {(d.marka || d.model) && <p>{[d.marka, d.model].filter(Boolean).join(" · ")}{d.seri_no ? ` · S/N: ${d.seri_no}` : ""}</p>}
                        {tarih && <p>Alış: {formatDate(tarih)}</p>}
                        {d.konum && <p>📍 {d.konum}</p>}
                        {zimmetli && (
                          <p className="flex items-center gap-1">
                            <User className="h-3 w-3" /> {zimmetli.ad_soyad}
                            {d.zimmet_tarihi ? ` (${formatDate(d.zimmet_tarihi)})` : ""}
                          </p>
                        )}
                        {d.garanti_bitis && (
                          <p className={garantiBitti ? "text-orange-500" : ""}>
                            🔒 Garanti: {formatDate(d.garanti_bitis)}{garantiBitti ? " (bitti)" : ""}
                          </p>
                        )}
                        {d.sonraki_bakim_tarihi && (
                          <p className={bakimGerekli ? "text-orange-500" : ""}>
                            🔧 Bakım: {formatDate(d.sonraki_bakim_tarihi)}{bakimGerekli ? " (gerekli)" : ""}
                          </p>
                        )}
                        {d.durum === "satildi" && d.satis_fiyati != null && (() => {
                          const kz = ((d.satis_fiyati ?? 0) - (d.alis_fiyati ?? 0)) * (d.adet ?? 1)
                          return (
                            <p>
                              💰 Satış: {formatCurrency((d.satis_fiyati ?? 0) * (d.adet ?? 1))}
                              {d.satis_tarihi ? ` · ${formatDate(d.satis_tarihi)}` : ""}
                              {" · "}
                              <span className={kz >= 0 ? "text-green-600" : "text-red-500"}>
                                {kz >= 0 ? "Kâr" : "Zarar"} {formatCurrency(Math.abs(kz))}
                              </span>
                            </p>
                          )
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {fiyat != null && (
                        <div className="text-right mr-1">
                          <p className="text-sm font-semibold">{formatCurrency(fiyat * (d.adet ?? 1))}</p>
                          {(d.adet ?? 1) > 1 && (
                            <p className="text-[10px] text-muted-foreground">{formatCurrency(fiyat)} × {d.adet}</p>
                          )}
                        </div>
                      )}
                      {isAdmin && (
                        <>
                          {!ELDEN_CIKAN.includes(d.durum) && (
                            <Button
                              variant="ghost" size="icon"
                              className="h-7 w-7 text-green-600 hover:text-green-600"
                              title="Sat"
                              onClick={() => setSatisDemirbas(d)}
                            >
                              <Banknote className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(d)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Demirbaşı Düzenle" : "Yeni Demirbaş"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">

            {editing?.kaynak_islem && (
              <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <p>Alış fiyatı ve tarihi bağlı gider işleminden geliyor. Değiştirmek için Finans sayfasından ilgili işlemi düzenleyin.</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Demirbaş Adı *</Label>
              <Input value={form.ad} onChange={e => f("ad", e.target.value)} placeholder="ör. MacBook Pro 14" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={form.kategori} onValueChange={v => f("kategori", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Durum</Label>
                <Select value={form.durum} onValueChange={v => f("durum", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DURUMLAR.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Marka</Label>
                <Input value={form.marka} onChange={e => f("marka", e.target.value)} placeholder="Apple" />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={form.model} onChange={e => f("model", e.target.value)} placeholder="MacBook Pro" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Seri No</Label>
                <Input value={form.seri_no} onChange={e => f("seri_no", e.target.value)} placeholder="ABC123..." />
              </div>
              <div className="space-y-1.5">
                <Label>Konum</Label>
                <Input value={form.konum} onChange={e => f("konum", e.target.value)} placeholder="Ofis / Depo" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Alış Tarihi</Label>
                <Input type="date" value={form.alis_tarihi} onChange={e => f("alis_tarihi", e.target.value)} disabled={!!editing?.kaynak_islem} />
              </div>
              <div className="space-y-1.5">
                <Label>Birim Alış Fiyatı (₺)</Label>
                <Input type="number" min="0" step="0.01" value={form.alis_fiyati} onChange={e => f("alis_fiyati", e.target.value)} placeholder="0.00" disabled={!!editing?.kaynak_islem} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adet</Label>
              <Input type="number" min="1" step="1" value={form.adet} onChange={e => f("adet", e.target.value)} />
              {!editing && (parseInt(form.adet) || 1) > 1 ? (
                <label className="flex items-start gap-2 pt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border mt-0.5"
                    checked={form.ayriKaydet}
                    onChange={e => setForm(p => ({ ...p, ayriKaydet: e.target.checked }))}
                  />
                  <span className="text-xs text-muted-foreground">
                    Her birini ayrı kaydet — seri no, zimmet ve durumu tek tek izlemek için
                    ({parseInt(form.adet) || 1} ayrı kayıt açılır)
                  </span>
                </label>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Aynı üründen birden fazlaysa tek kayıtta tutabilirsin. Toplam değer = birim fiyat × adet.
                </p>
              )}
            </div>

            {/* Grup, bu girişe ait bir partidir; mevcut bir gruba ekleme yapılmaz. */}
            {!editing && (
              <div className="space-y-1.5">
                <Label>Grup Adı (isteğe bağlı)</Label>
                <Input
                  value={form.grup_adi}
                  onChange={e => f("grup_adi", e.target.value)}
                  placeholder='ör. "Başlangıç Demirbaş Listesi", "12.03.2026 Alımı"'
                />
                <p className="text-xs text-muted-foreground">
                  Bu giriş için yeni bir grup oluşturulur. Boş bırakırsan kayıtlar gruplanmamış kalır.
                </p>
              </div>
            )}

            {/* Zimmet */}
            <div className="space-y-3 border border-border rounded-lg p-3">
              <p className="text-sm font-medium">Zimmet</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Zimmetli Kişi</Label>
                  <Select value={form.zimmet_kullanici_id || "bos"} onValueChange={v => f("zimmet_kullanici_id", v === "bos" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bos">— Zimmet yok —</SelectItem>
                      {kullanicilar.map(k => <SelectItem key={k.id} value={k.id}>{k.ad_soyad}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Zimmet Tarihi</Label>
                  <Input type="date" value={form.zimmet_tarihi} onChange={e => f("zimmet_tarihi", e.target.value)} />
                </div>
              </div>
            </div>

            {/* Garanti & Bakım */}
            <div className="space-y-3 border border-border rounded-lg p-3">
              <p className="text-sm font-medium">Garanti & Bakım</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Garanti Bitiş</Label>
                  <Input type="date" value={form.garanti_bitis} onChange={e => f("garanti_bitis", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Son Bakım</Label>
                  <Input type="date" value={form.son_bakim_tarihi} onChange={e => f("son_bakim_tarihi", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Sonraki Bakım</Label>
                <Input type="date" value={form.sonraki_bakim_tarihi} onChange={e => f("sonraki_bakim_tarihi", e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Notlar</Label>
              <Input value={form.notlar} onChange={e => f("notlar", e.target.value)} placeholder="Ek notlar..." />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
              <Button onClick={handleSave} disabled={saving || !form.ad}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Kaydet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Grup silme — iki farklı sonuç olduğu için onay kutusu yerine dialog */}
      <Dialog open={!!silinecekGrup} onOpenChange={o => !o && setSilinecekGrup(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Grubu Sil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <p className="text-sm">
              <strong>{silinecekGrup?.grup.ad}</strong> grubunda {silinecekGrup?.adet} kayıt var.
              Ne yapmak istiyorsun?
            </p>

            <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">
              Kayıtları da silersen, satın almadan gelen demirbaşların <strong>bağlı gider işlemleri de silinir</strong> —
              bu işlem geri alınamaz.
            </div>

            <div className="space-y-2">
              <Button
                variant="outline" className="w-full justify-start"
                disabled={grupSiliniyor}
                onClick={grubuSil}
              >
                Sadece grubu sil — kayıtlar "Gruplanmamış"a düşer
              </Button>
              <Button
                variant="destructive" className="w-full justify-start"
                disabled={grupSiliniyor}
                onClick={grubuVeKayitlariSil}
              >
                {grupSiliniyor && <Loader2 className="h-4 w-4 animate-spin" />}
                Grubu ve {silinecekGrup?.adet} kaydı birlikte sil
              </Button>
            </div>

            <div className="flex justify-end pt-1">
              <Button variant="ghost" onClick={() => setSilinecekGrup(null)}>İptal</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Parti (grup) düzenleme */}
      <Dialog open={!!duzenlenenGrup} onOpenChange={o => !o && setDuzenlenenGrup(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Grubu Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Grup Adı *</Label>
                <Input
                  value={grupForm.ad}
                  onChange={e => { setGrupForm(g => ({ ...g, ad: e.target.value })); setGrupError(null) }}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Alış Tarihi</Label>
                <Input type="date" value={grupForm.tarih} onChange={e => setGrupForm(g => ({ ...g, tarih: e.target.value }))} />
              </div>
            </div>

            <div className="relative flex items-center gap-2 py-1">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground shrink-0">Ekipman Bilgisi</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <div className="space-y-1.5">
              <Label>Ekipman Adı *</Label>
              <Input
                value={grupForm.ekipmanAd}
                onChange={e => { setGrupForm(g => ({ ...g, ekipmanAd: e.target.value })); setGrupError(null) }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={grupForm.kategori} onValueChange={v => setGrupForm(g => ({ ...g, kategori: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Adet</Label>
                <Input
                  type="number" min="1" step="1"
                  value={grupForm.adet}
                  onChange={e => { setGrupForm(g => ({ ...g, adet: e.target.value })); setGrupError(null) }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Marka</Label>
                <Input value={grupForm.marka} onChange={e => setGrupForm(g => ({ ...g, marka: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={grupForm.model} onChange={e => setGrupForm(g => ({ ...g, model: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Birim Alış Fiyatı (₺)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={grupForm.alis_fiyati}
                  onChange={e => setGrupForm(g => ({ ...g, alis_fiyati: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Konum</Label>
                <Input value={grupForm.konum} onChange={e => setGrupForm(g => ({ ...g, konum: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Garanti Bitiş</Label>
              <Input type="date" value={grupForm.garanti_bitis} onChange={e => setGrupForm(g => ({ ...g, garanti_bitis: e.target.value }))} />
            </div>

            {duzenlenenGrup && (() => {
              const mevcut = duzenlenenGrup.grup.ayri_kayit
                ? duzenlenenGrup.items.length
                : (duzenlenenGrup.items[0]?.adet ?? 1)
              const hedef = Math.max(1, parseInt(grupForm.adet) || 1)
              const fark = hedef - mevcut
              return (
                <div className="rounded-md border border-border px-3 py-2 text-xs space-y-1">
                  <p className="text-muted-foreground">
                    Ortak alanlar gruptaki tüm kayıtlara yazılır.
                    Seri no, zimmet, durum ve bakım bilgileri eşyaya özel olduğu için korunur.
                  </p>
                  {duzenlenenGrup.grup.ayri_kayit && fark !== 0 && (
                    <p className={fark < 0 ? "text-destructive font-medium" : "text-green-600 font-medium"}>
                      {fark < 0
                        ? `${-fark} kayıt silinecek (önce seri no / zimmet girilmemiş olanlar).`
                        : `${fark} yeni kayıt eklenecek.`}
                    </p>
                  )}
                  {!duzenlenenGrup.grup.ayri_kayit && (
                    <p className="text-muted-foreground">
                      Bu grup tek kayıtlı; adet değişikliği kaydın adedini günceller.
                    </p>
                  )}
                </div>
              )
            })()}

            {grupError && <p className="text-sm text-destructive">{grupError}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDuzenlenenGrup(null)}>İptal</Button>
              <Button onClick={handleGrupSave} disabled={grupSaving || !grupForm.ad.trim() || !grupForm.ekipmanAd.trim()}>
                {grupSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                Kaydet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DemirbasSatisDialog
        open={!!satisDemirbas}
        onClose={() => setSatisDemirbas(null)}
        demirbas={satisDemirbas}
        onSaved={load}
      />
    </div>
  )
}
