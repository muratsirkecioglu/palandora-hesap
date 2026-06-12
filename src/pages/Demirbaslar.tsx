import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, AlertTriangle, User, Info } from "lucide-react"
import { supabase, type Demirbase, type AppUser } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
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
]
const DURUM_VARIANT: Record<string, "success" | "warning" | "destructive" | "outline"> = {
  aktif: "success",
  bakimda: "warning",
  hurda: "destructive",
  devredildi: "outline",
}

interface KaynakIslem { tutar: number; tarih: string }
type DemirbasRow = Demirbase & { kaynak_islem: KaynakIslem | null }

const defaultForm = {
  ad: "", kategori: "Bilgisayar", marka: "", model: "", seri_no: "",
  alis_tarihi: "", alis_fiyati: "", konum: "", durum: "aktif" as Demirbase["durum"],
  zimmet_kullanici_id: "", zimmet_tarihi: "",
  garanti_bitis: "", son_bakim_tarihi: "", sonraki_bakim_tarihi: "", notlar: "",
}

export function Demirbaslar() {
  const { isAdmin } = useAuth()
  const [kayitlar, setKayitlar] = useState<DemirbasRow[]>([])
  const [kullanicilar, setKullanicilar] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DemirbasRow | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [filterKat, setFilterKat] = useState("tumu")
  const [filterDurum, setFilterDurum] = useState("tumu")
  const [search, setSearch] = useState("")

  async function load() {
    setLoading(true)
    const [{ data: db }, { data: ku }] = await Promise.all([
      supabase.from("demirbaslar").select("*, kaynak_islem:islemler!kaynak_islem_id(tutar, tarih)").order("ad"),
      supabase.from("kullanicilar").select("*").eq("aktif", true).order("ad_soyad"),
    ])
    setKayitlar((db ?? []) as DemirbasRow[])
    setKullanicilar((ku ?? []) as AppUser[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function f(field: string, value: string) { setForm(p => ({ ...p, [field]: value })) }

  function openNew() { setEditing(null); setForm(defaultForm); setDialogOpen(true) }

  function openEdit(d: DemirbasRow) {
    setEditing(d)
    const alisFiyati = d.kaynak_islem ? String(d.kaynak_islem.tutar) : (d.alis_fiyati != null ? String(d.alis_fiyati) : "")
    const alisTarihi = d.kaynak_islem ? d.kaynak_islem.tarih : (d.alis_tarihi ?? "")
    setForm({
      ad: d.ad, kategori: d.kategori, marka: d.marka ?? "", model: d.model ?? "",
      seri_no: d.seri_no ?? "", alis_tarihi: alisTarihi,
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
    const payload = {
      ad: form.ad, kategori: form.kategori,
      marka: form.marka || null, model: form.model || null,
      seri_no: form.seri_no || null,
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
    if (editing) {
      await supabase.from("demirbaslar").update(payload).eq("id", editing.id)
    } else {
      await supabase.from("demirbaslar").insert(payload)
    }
    setSaving(false)
    setDialogOpen(false)
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

  const toplamDeger = kayitlar.reduce((s, d) => {
    const fiyat = d.kaynak_islem?.tutar ?? d.alis_fiyati ?? 0
    return s + fiyat
  }, 0)
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
          <p className="text-xs text-muted-foreground mb-1">Toplam Kayıt</p>
          <p className="text-lg font-bold">{kayitlar.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Değer</p>
          <p className="text-lg font-bold">{formatCurrency(toplamDeger)}</p>
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
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">Demirbaş bulunamadı</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(d => {
                const zimmetli = kullaniciBul(d.zimmet_kullanici_id)
                const garantiBitti = d.garanti_bitis && d.garanti_bitis <= today
                const bakimGerekli = d.sonraki_bakim_tarihi && d.sonraki_bakim_tarihi <= today
                const fiyat = d.kaynak_islem?.tutar ?? d.alis_fiyati
                const tarih = d.kaynak_islem?.tarih ?? d.alis_tarihi

                return (
                  <div key={d.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{d.ad}</p>
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
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {fiyat != null && (
                        <p className="text-sm font-semibold mr-1">{formatCurrency(fiyat)}</p>
                      )}
                      {isAdmin && (
                        <>
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
                <Label>Alış Fiyatı (₺)</Label>
                <Input type="number" min="0" step="0.01" value={form.alis_fiyati} onChange={e => f("alis_fiyati", e.target.value)} placeholder="0.00" disabled={!!editing?.kaynak_islem} />
              </div>
            </div>

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
    </div>
  )
}
