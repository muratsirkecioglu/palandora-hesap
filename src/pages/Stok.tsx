import { useEffect, useState } from "react"
import { Pencil, Trash2, Loader2, AlertTriangle, FileCheck, FileX, Info, ChevronDown, ChevronRight } from "lucide-react"
import { supabase, type Malzeme, type MalzemeWithStok } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"

const KATEGORILER = ["Hammadde", "Yarı Mamul", "Mamul", "Sarf Malzeme", "Ekipman", "Diğer"]
const BIRIMLER = ["Adet", "Kg", "Lt", "m", "m²", "m³", "Paket", "Kutu", "Ton"]

interface EditForm {
  ad: string
  kategori: string
  birim: string
  min_miktar: string
  aciklama: string
}

type CikisRow = {
  tarih: string
  miktar: number
  birim_fiyat: number
  aciklama: string
  kategori: string
}

type StokRow = {
  islem_id: string
  malzeme_id: string
  miktar: number
  tur: string
  birim_fiyat: number
  islem: {
    tutar: number
    nakliye_tutari: number | null
    nakliye_faturali: boolean
    tarih: string
    faturali: boolean
    aciklama: string
    kategori: string
  } | null
}

export function Stok() {
  const { isAdmin, user } = useAuth()
  const [malzemeler, setMalzemeler] = useState<MalzemeWithStok[]>([])
  const [cikisMap, setCikisMap] = useState<Map<string, CikisRow[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MalzemeWithStok | null>(null)
  const [form, setForm] = useState<EditForm>({
    ad: "", kategori: "Hammadde", birim: "Adet", min_miktar: "", aciklama: "",
  })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [filterKat, setFilterKat] = useState("tumu")

  async function load() {
    setLoading(true)
    const [{ data: malzemeData }, { data: stokData }] = await Promise.all([
      supabase.from("malzemeler").select("*").order("ad"),
      supabase.from("islem_stok")
        .select("islem_id, malzeme_id, miktar, tur, birim_fiyat, islem:islemler!islem_id(tutar, nakliye_tutari, nakliye_faturali, tarih, faturali, aciklama, kategori)")
        .order("created_at", { ascending: false }),
    ])

    const rows = (stokData ?? []) as unknown as StokRow[]

    const stokMap = new Map<string, { giris: number; cikis: number; sonGiris: StokRow | null }>()
    const cikislar = new Map<string, CikisRow[]>()

    for (const s of rows) {
      const e = stokMap.get(s.malzeme_id) ?? { giris: 0, cikis: 0, sonGiris: null }
      if (s.tur === "giris") {
        e.giris += s.miktar
        if (!e.sonGiris) e.sonGiris = s
      } else {
        e.cikis += s.miktar
        const list = cikislar.get(s.malzeme_id) ?? []
        list.push({
          tarih: s.islem?.tarih ?? "",
          miktar: s.miktar,
          birim_fiyat: s.birim_fiyat,
          aciklama: s.islem?.aciklama ?? "",
          kategori: s.islem?.kategori ?? "",
        })
        cikislar.set(s.malzeme_id, list)
      }
      stokMap.set(s.malzeme_id, e)
    }

    const malzemelerWithStok: MalzemeWithStok[] = ((malzemeData ?? []) as Malzeme[]).map(m => {
      const e = stokMap.get(m.id)
      return {
        ...m,
        stok: e ? e.giris - e.cikis : 0,
        son_birim_fiyat: e?.sonGiris?.birim_fiyat ?? null,
        son_giris_islem: e?.sonGiris?.islem ?? null,
      }
    })

    setMalzemeler(malzemelerWithStok)
    setCikisMap(cikislar)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function f(field: keyof EditForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function openEdit(m: MalzemeWithStok) {
    setEditing(m)
    setForm({ ad: m.ad, kategori: m.kategori, birim: m.birim, min_miktar: String(m.min_miktar), aciklama: m.aciklama ?? "" })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!editing || !form.ad) return
    setSaving(true)
    await supabase.from("malzemeler").update({
      ad: form.ad, kategori: form.kategori, birim: form.birim,
      min_miktar: parseFloat(form.min_miktar) || 0,
      aciklama: form.aciklama,
      updated_at: new Date().toISOString(),
    }).eq("id", editing.id)
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu malzemeyi silmek istediğinize emin misiniz?\nBağlı stok hareketleri de silinecektir.")) return
    await supabase.from("islem_stok").delete().eq("malzeme_id", id)
    await supabase.from("malzemeler").delete().eq("id", id)
    load()
  }

  const filtered = malzemeler
    .filter(m => {
      const matchSearch = m.ad.toLowerCase().includes(search.toLowerCase())
      const matchKat = filterKat === "tumu" || m.kategori === filterKat
      return matchSearch && matchKat
    })
    .sort((a, b) => {
      const bitmiA = a.stok <= 0
      const bitmiB = b.stok <= 0
      if (bitmiA !== bitmiB) return bitmiA ? 1 : -1
      return a.ad.localeCompare(b.ad, "tr")
    })

  const kritik = malzemeler.filter(m => m.stok <= m.min_miktar && m.min_miktar > 0).length
  const toplamDeger = malzemeler.reduce((s, m) => s + m.stok * (m.son_birim_fiyat ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stok Yönetimi</h1>
        <p className="text-muted-foreground text-sm">Malzeme ve stok takibi</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>Yeni malzeme eklemek için <strong>Finans → Yeni İşlem → Gider → Malzeme</strong> kategorisini kullanın.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Kalem</p>
          <p className="text-lg font-bold">{malzemeler.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Kritik Stok</p>
          <p className={`text-lg font-bold ${kritik > 0 ? "text-orange-500" : "text-green-600"}`}>{kritik}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Değer</p>
          <p className="text-lg font-bold">{formatCurrency(toplamDeger)}</p>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input placeholder="Malzeme ara..." value={search} onChange={e => setSearch(e.target.value)} className="sm:max-w-xs" />
            <Select value={filterKat} onValueChange={setFilterKat}>
              <SelectTrigger className="sm:max-w-[180px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="tumu">Tüm Kategoriler</SelectItem>
                {KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">Malzeme bulunamadı</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(m => {
                const kritikMi = m.stok <= m.min_miktar && m.min_miktar > 0
                const bitmisMi = m.stok <= 0
                const gi = m.son_giris_islem
                const kullanim = cikisMap.get(m.id) ?? []
                const isExpanded = expanded.has(m.id)

                return (
                  <div key={m.id} className={bitmisMi ? "opacity-40" : ""}>
                    {/* Ana satır */}
                    <div className="flex items-center justify-between py-3 gap-2">
                      {/* Genişlet butonu */}
                      <button
                        onClick={() => kullanim.length > 0 && toggleExpanded(m.id)}
                        className={`shrink-0 text-muted-foreground transition-colors ${kullanim.length > 0 ? "hover:text-foreground cursor-pointer" : "opacity-0 cursor-default"}`}
                      >
                        {isExpanded
                          ? <ChevronDown className="h-4 w-4" />
                          : <ChevronRight className="h-4 w-4" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm">{m.ad}</p>
                          {kritikMi && <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                          <Badge variant="outline" className="text-xs shrink-0">{m.kategori}</Badge>
                          {gi && (gi.faturali
                            ? <FileCheck className="h-3.5 w-3.5 shrink-0 text-green-600" />
                            : <FileX className="h-3.5 w-3.5 shrink-0 text-orange-400" />)}
                          {kullanim.length > 0 && (
                            <span className="text-xs text-muted-foreground">{kullanim.length} kullanım</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Min: {m.min_miktar} {m.birim}
                          {gi?.tarih && ` · ${formatDate(gi.tarih)}`}
                          {gi?.nakliye_tutari != null && ` · Nakliye: ${formatCurrency(gi.nakliye_tutari)}`}
                          {gi?.nakliye_tutari != null && (gi.nakliye_faturali
                            ? <FileCheck className="inline h-3 w-3 ml-1 text-green-600" />
                            : <FileX className="inline h-3 w-3 ml-1 text-orange-400" />)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className={`font-semibold text-sm ${kritikMi ? "text-orange-500" : ""}`}>
                            {m.stok} {m.birim}
                          </p>
                          {m.son_birim_fiyat != null && (
                            <p className="text-xs text-muted-foreground">{formatCurrency(m.son_birim_fiyat)}/{m.birim}</p>
                          )}
                        </div>
                        {(isAdmin || m.kullanici_id === user?.id) && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {isAdmin && (
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(m.id)}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Kullanım listesi */}
                    {isExpanded && kullanim.length > 0 && (
                      <div className="ml-6 mb-3 rounded-md border border-border bg-muted/30 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-border text-muted-foreground">
                              <th className="text-left font-medium px-3 py-1.5">Tarih</th>
                              <th className="text-left font-medium px-3 py-1.5">İşlem</th>
                              <th className="text-left font-medium px-3 py-1.5 hidden sm:table-cell">Kategori</th>
                              <th className="text-right font-medium px-3 py-1.5">Miktar</th>
                              <th className="text-right font-medium px-3 py-1.5 hidden sm:table-cell">Birim Fiyat</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {kullanim.map((k, i) => (
                              <tr key={i} className="hover:bg-muted/50">
                                <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{formatDate(k.tarih)}</td>
                                <td className="px-3 py-1.5">{k.aciklama || "—"}</td>
                                <td className="px-3 py-1.5 hidden sm:table-cell text-muted-foreground">{k.kategori || "—"}</td>
                                <td className="px-3 py-1.5 text-right font-medium text-red-500">-{k.miktar} {m.birim}</td>
                                <td className="px-3 py-1.5 text-right hidden sm:table-cell text-muted-foreground">
                                  {k.birim_fiyat > 0 ? formatCurrency(k.birim_fiyat) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Malzemeyi Düzenle</DialogTitle></DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Malzeme Adı</Label>
              <Input value={form.ad} onChange={e => f("ad", e.target.value)} placeholder="Malzeme adı" />
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
                <Label>Birim</Label>
                <Select value={form.birim} onValueChange={v => f("birim", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BIRIMLER.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Min. Stok Miktarı</Label>
              <Input type="number" min="0" value={form.min_miktar} onChange={e => f("min_miktar", e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Açıklama (isteğe bağlı)</Label>
              <Input value={form.aciklama} onChange={e => f("aciklama", e.target.value)} placeholder="Notlar..." />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
              <Button onClick={handleSave} disabled={saving}>
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
