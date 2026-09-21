import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, Users, X, Building2 } from "lucide-react"
import { supabase, type Cari, type CariTip } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { useSirket } from "@/contexts/SirketContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"

const TIP_LABEL: Record<CariTip, string> = {
  musteri: "Müşteri",
  tedarikci: "Tedarikçi",
  her_ikisi: "Müşteri + Tedarikçi",
}

/** Bir işlemin cari bakiyeye katkısı ve vade durumu */
interface CariIslem {
  id: string
  tarih: string
  vade_tarihi: string | null
  aciklama: string
  tur: "gelir" | "gider"
  kategori: string
  tutar: number
  odenen: number
  kalan: number
}

interface CariRow extends Cari {
  /** + ise cari bize borçlu (alacağımız), − ise biz borçluyuz */
  bakiye: number
  alacak: number
  borc: number
  islemSayisi: number
}

const defaultForm = {
  unvan: "", tip: "musteri" as CariTip, vergi_dairesi: "", vergi_no: "",
  telefon: "", email: "", adres: "", notlar: "", aktif: true,
}

/** Vadesi geçen gün sayısına göre yaşlandırma kovası */
function yasKovasi(vade: string | null, bugun: string) {
  if (!vade || vade >= bugun) return null
  const gun = Math.floor((new Date(bugun).getTime() - new Date(vade).getTime()) / 86400000)
  if (gun <= 30) return "0-30"
  if (gun <= 60) return "31-60"
  if (gun <= 90) return "61-90"
  return "90+"
}

export function Cariler() {
  const { user } = useAuth()
  const { aktifSirketId, isSirketAdmin: isAdmin } = useSirket()
  const [cariler, setCariler] = useState<CariRow[]>([])
  const [islemMap, setIslemMap] = useState<Map<string, CariIslem[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Cari | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [filterTip, setFilterTip] = useState("tumu")
  const [seciliId, setSeciliId] = useState<string | null>(null)

  const bugun = new Date().toISOString().slice(0, 10)

  async function load() {
    if (!aktifSirketId) return
    setLoading(true)

    const [{ data: cariData }, { data: islemData }, { data: odemeData }] = await Promise.all([
      supabase.from("cariler").select("*").eq("sirket_id", aktifSirketId).order("unvan"),
      supabase.from("islemler")
        .select("id, cari_id, tarih, vade_tarihi, aciklama, tur, kategori, tutar, nakliye_tutari")
        .eq("sirket_id", aktifSirketId)
        .not("cari_id", "is", null)
        .order("tarih", { ascending: false }),
      supabase.from("odemeler").select("islem_id, tutar").eq("sirket_id", aktifSirketId),
    ])

    // İşlem başına ödenen toplam
    const odenenMap = new Map<string, number>()
    for (const o of (odemeData ?? []) as { islem_id: string; tutar: number }[]) {
      odenenMap.set(o.islem_id, (odenenMap.get(o.islem_id) ?? 0) + o.tutar)
    }

    type IslemRow = {
      id: string; cari_id: string; tarih: string; vade_tarihi: string | null
      aciklama: string; tur: "gelir" | "gider"; kategori: string
      tutar: number; nakliye_tutari: number | null
    }

    const perCari = new Map<string, CariIslem[]>()
    for (const i of (islemData ?? []) as IslemRow[]) {
      const tutar = i.tutar + (i.nakliye_tutari ?? 0)
      const odenen = odenenMap.get(i.id) ?? 0
      const kayit: CariIslem = {
        id: i.id, tarih: i.tarih, vade_tarihi: i.vade_tarihi, aciklama: i.aciklama,
        tur: i.tur, kategori: i.kategori, tutar, odenen, kalan: tutar - odenen,
      }
      perCari.set(i.cari_id, [...(perCari.get(i.cari_id) ?? []), kayit])
    }
    setIslemMap(perCari)

    const rows: CariRow[] = ((cariData ?? []) as Cari[]).map(c => {
      const list = perCari.get(c.id) ?? []
      // Kalan tutarlar bakiyeyi oluşturur: tahsil edilmemiş gelir alacak,
      // ödenmemiş gider borçtur.
      const alacak = list.filter(i => i.tur === "gelir").reduce((s, i) => s + i.kalan, 0)
      const borc = list.filter(i => i.tur === "gider").reduce((s, i) => s + i.kalan, 0)
      return { ...c, alacak, borc, bakiye: alacak - borc, islemSayisi: list.length }
    })
    setCariler(rows)
    setLoading(false)
  }

  useEffect(() => { load() }, [aktifSirketId])

  function openNew() {
    setEditing(null)
    setForm(defaultForm)
    setError(null)
    setDialogOpen(true)
  }

  function openEdit(c: Cari) {
    setEditing(c)
    setForm({
      unvan: c.unvan, tip: c.tip,
      vergi_dairesi: c.vergi_dairesi ?? "", vergi_no: c.vergi_no ?? "",
      telefon: c.telefon ?? "", email: c.email ?? "",
      adres: c.adres ?? "", notlar: c.notlar ?? "", aktif: c.aktif,
    })
    setError(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.unvan.trim()) { setError("Ünvan zorunludur."); return }
    setSaving(true)
    setError(null)
    const payload = {
      unvan: form.unvan.trim(), tip: form.tip,
      vergi_dairesi: form.vergi_dairesi || null, vergi_no: form.vergi_no || null,
      telefon: form.telefon || null, email: form.email || null,
      adres: form.adres || null, notlar: form.notlar || null,
      aktif: form.aktif,
      updated_at: new Date().toISOString(),
    }
    const { error } = editing
      ? await supabase.from("cariler").update(payload).eq("id", editing.id)
      : await supabase.from("cariler").insert({ ...payload, sirket_id: aktifSirketId, kullanici_id: user!.id })
    setSaving(false)
    if (error) { setError(error.message); return }
    setDialogOpen(false)
    load()
  }

  async function handleDelete(c: CariRow) {
    if (c.islemSayisi > 0) {
      if (!confirm(`"${c.unvan}" carisine bağlı ${c.islemSayisi} işlem var.\nCari silinirse işlemler KALIR, yalnızca cari bağı kopar.\nDevam edilsin mi?`)) return
    } else if (!confirm(`"${c.unvan}" silinsin mi?`)) return
    const { error } = await supabase.from("cariler").delete().eq("id", c.id)
    if (error) { alert("Silme hatası: " + error.message); return }
    if (seciliId === c.id) setSeciliId(null)
    load()
  }

  const filtered = cariler.filter(c => {
    const q = search.toLowerCase()
    const eslesme = !q || c.unvan.toLowerCase().includes(q)
      || (c.vergi_no ?? "").includes(q) || (c.telefon ?? "").includes(q)
    const tipEslesme = filterTip === "tumu" || c.tip === filterTip
      || (c.tip === "her_ikisi" && filterTip !== "tumu")
    return eslesme && tipEslesme
  })

  const toplamAlacak = cariler.reduce((s, c) => s + c.alacak, 0)
  const toplamBorc = cariler.reduce((s, c) => s + c.borc, 0)

  // Yaşlandırma yalnızca tahsil edilmemiş alacaklar için anlamlı
  const yaslandirma = (() => {
    const kovalar: Record<string, number> = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 }
    for (const list of islemMap.values()) {
      for (const i of list) {
        if (i.tur !== "gelir" || i.kalan <= 0.005) continue
        const k = yasKovasi(i.vade_tarihi, bugun)
        if (k) kovalar[k] += i.kalan
      }
    }
    return kovalar
  })()
  const vadesiGecenToplam = Object.values(yaslandirma).reduce((s, v) => s + v, 0)

  const secili = cariler.find(c => c.id === seciliId) ?? null
  const seciliIslemler = seciliId ? (islemMap.get(seciliId) ?? []) : []

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cari Hesaplar</h1>
          <p className="text-muted-foreground text-sm">Müşteri ve tedarikçi alacak/borç takibi</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4" /> Yeni Cari
        </Button>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Alacak</p>
          <p className="text-lg font-bold text-green-600">{formatCurrency(toplamAlacak)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Borç</p>
          <p className="text-lg font-bold text-red-500">{formatCurrency(toplamBorc)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Net Durum</p>
          <p className={`text-lg font-bold ${toplamAlacak - toplamBorc >= 0 ? "text-green-600" : "text-red-500"}`}>
            {formatCurrency(toplamAlacak - toplamBorc)}
          </p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Vadesi Geçen</p>
          <p className={`text-lg font-bold ${vadesiGecenToplam > 0 ? "text-orange-500" : "text-muted-foreground"}`}>
            {formatCurrency(vadesiGecenToplam)}
          </p>
        </CardContent></Card>
      </div>

      {/* Yaşlandırma */}
      {vadesiGecenToplam > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b border-border">
            <CardTitle className="text-sm font-semibold">Alacak Yaşlandırma (vadesi geçen)</CardTitle>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="grid grid-cols-4 gap-3 text-center">
              {(["0-30", "31-60", "61-90", "90+"] as const).map(k => (
                <div key={k} className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground mb-0.5">{k} gün</p>
                  <p className={`text-sm font-bold ${yaslandirma[k] > 0 ? (k === "90+" ? "text-red-500" : "text-orange-500") : "text-muted-foreground"}`}>
                    {formatCurrency(yaslandirma[k])}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Liste */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              placeholder="Ünvan, vergi no veya telefon ara..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="sm:max-w-xs"
            />
            <Select value={filterTip} onValueChange={setFilterTip}>
              <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tumu">Tüm Tipler</SelectItem>
                <SelectItem value="musteri">Müşteri</SelectItem>
                <SelectItem value="tedarikci">Tedarikçi</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">
              {cariler.length === 0 ? "Henüz cari tanımlanmamış" : "Cari bulunamadı"}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(c => (
                <div
                  key={c.id}
                  className={`py-3 flex items-start justify-between gap-3 cursor-pointer transition-colors ${seciliId === c.id ? "bg-muted/40" : "hover:bg-muted/20"}`}
                  onClick={() => setSeciliId(seciliId === c.id ? null : c.id)}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm truncate">{c.unvan}</p>
                        <Badge variant="outline" className="text-xs">{TIP_LABEL[c.tip]}</Badge>
                        {!c.aktif && <Badge variant="outline" className="text-xs">Pasif</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 space-y-0.5">
                        {(c.vergi_dairesi || c.vergi_no) && (
                          <p>{[c.vergi_dairesi, c.vergi_no].filter(Boolean).join(" · ")}</p>
                        )}
                        {(c.telefon || c.email) && (
                          <p>{[c.telefon, c.email].filter(Boolean).join(" · ")}</p>
                        )}
                        <p>{c.islemSayisi} işlem</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <div className="text-right mr-1">
                      <p className={`text-sm font-semibold ${c.bakiye > 0.005 ? "text-green-600" : c.bakiye < -0.005 ? "text-red-500" : "text-muted-foreground"}`}>
                        {formatCurrency(Math.abs(c.bakiye))}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {c.bakiye > 0.005 ? "Bize borçlu" : c.bakiye < -0.005 ? "Biz borçluyuz" : "Kapalı"}
                      </p>
                    </div>
                    {isAdmin && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(c)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ekstre */}
      {secili && (
        <Card>
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  {secili.unvan} — Ekstre
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {seciliIslemler.length} işlem · Alacak {formatCurrency(secili.alacak)} · Borç {formatCurrency(secili.borc)}
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSeciliId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-0">
            {seciliIslemler.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Bu cariye bağlı işlem yok</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left font-medium px-4 py-2">Tarih</th>
                      <th className="text-left font-medium px-3 py-2">Açıklama</th>
                      <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Vade</th>
                      <th className="text-right font-medium px-3 py-2">Tutar</th>
                      <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">Ödenen</th>
                      <th className="text-right font-medium px-4 py-2">Kalan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {seciliIslemler.map(i => {
                      const gecikme = i.kalan > 0.005 ? yasKovasi(i.vade_tarihi, bugun) : null
                      return (
                        <tr key={i.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">{formatDate(i.tarih)}</td>
                          <td className="px-3 py-2">
                            <p className="font-medium">{i.aciklama}</p>
                            <p className="text-muted-foreground">{i.kategori}</p>
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell whitespace-nowrap">
                            {i.vade_tarihi ? (
                              <span className={gecikme ? "text-orange-500 font-medium" : "text-muted-foreground"}>
                                {formatDate(i.vade_tarihi)}{gecikme ? ` (${gecikme} gün)` : ""}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className={`px-3 py-2 text-right font-medium whitespace-nowrap ${i.tur === "gelir" ? "text-green-600" : "text-red-500"}`}>
                            {i.tur === "gelir" ? "+" : "-"}{formatCurrency(i.tutar)}
                          </td>
                          <td className="px-3 py-2 text-right hidden sm:table-cell text-muted-foreground whitespace-nowrap">
                            {formatCurrency(i.odenen)}
                          </td>
                          <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${i.kalan > 0.005 ? "" : "text-muted-foreground"}`}>
                            {formatCurrency(i.kalan)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                      <td colSpan={5} className="px-4 py-2">Bakiye</td>
                      <td className={`px-4 py-2 text-right whitespace-nowrap ${secili.bakiye > 0.005 ? "text-green-600" : secili.bakiye < -0.005 ? "text-red-500" : ""}`}>
                        {formatCurrency(Math.abs(secili.bakiye))}
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          {secili.bakiye > 0.005 ? "bize borçlu" : secili.bakiye < -0.005 ? "biz borçluyuz" : "kapalı"}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cari formu */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Cariyi Düzenle" : "Yeni Cari"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Ünvan *</Label>
              <Input
                value={form.unvan}
                onChange={e => { setForm(f => ({ ...f, unvan: e.target.value })); setError(null) }}
                placeholder="ör. Yılmaz Tekstil Ltd. Şti."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Tip</Label>
              <Select value={form.tip} onValueChange={v => setForm(f => ({ ...f, tip: v as CariTip }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="musteri">Müşteri</SelectItem>
                  <SelectItem value="tedarikci">Tedarikçi</SelectItem>
                  <SelectItem value="her_ikisi">Müşteri + Tedarikçi</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Vergi Dairesi</Label>
                <Input value={form.vergi_dairesi} onChange={e => setForm(f => ({ ...f, vergi_dairesi: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Vergi / TC No</Label>
                <Input value={form.vergi_no} onChange={e => setForm(f => ({ ...f, vergi_no: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefon</Label>
                <Input value={form.telefon} onChange={e => setForm(f => ({ ...f, telefon: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>E-posta</Label>
                <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Adres</Label>
              <Input value={form.adres} onChange={e => setForm(f => ({ ...f, adres: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Notlar</Label>
              <Input value={form.notlar} onChange={e => setForm(f => ({ ...f, notlar: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox" id="cari_aktif"
                checked={form.aktif}
                onChange={e => setForm(f => ({ ...f, aktif: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="cari_aktif" className="text-sm font-medium cursor-pointer">Aktif</label>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
              <Button onClick={handleSave} disabled={saving || !form.unvan.trim()}>
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
