import { useEffect, useState } from "react"
import { Pencil, Trash2, Loader2, AlertTriangle, Info, FileCheck, FileX } from "lucide-react"
import { supabase, type Malzeme } from "@/lib/supabase"
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

interface KaynakIslem {
  tutar: number
  nakliye_tutari: number | null
  nakliye_faturali: boolean
  tarih: string
  faturali: boolean
}

type MalzemeRow = Malzeme & { kaynak_islem: KaynakIslem | null }

interface EditForm {
  ad: string
  kategori: string
  birim: string
  min_miktar: string
  aciklama: string
}

export function Stok() {
  const { isAdmin, user } = useAuth()
  const [malzemeler, setMalzemeler] = useState<MalzemeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<MalzemeRow | null>(null)
  const [form, setForm] = useState<EditForm>({
    ad: "", kategori: "Hammadde", birim: "Adet", min_miktar: "", aciklama: "",
  })
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [filterKat, setFilterKat] = useState("tumu")

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from("malzemeler")
      .select("*, kaynak_islem:islemler!kaynak_islem_id(tutar, nakliye_tutari, nakliye_faturali, tarih, faturali)")
      .order("created_at", { ascending: false })
    setMalzemeler((data ?? []) as MalzemeRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function f(field: keyof EditForm, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function openEdit(m: MalzemeRow) {
    setEditing(m)
    setForm({
      ad: m.ad,
      kategori: m.kategori,
      birim: m.birim,
      min_miktar: String(m.min_miktar),
      aciklama: m.aciklama ?? "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!editing || !form.ad) return
    setSaving(true)
    await supabase.from("malzemeler").update({
      ad: form.ad,
      kategori: form.kategori,
      birim: form.birim,
      min_miktar: parseFloat(form.min_miktar) || 0,
      aciklama: form.aciklama,
      updated_at: new Date().toISOString(),
    }).eq("id", editing.id)
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu malzemeyi silmek istediğinize emin misiniz?\nBağlı gider kaydı da silinecektir.")) return
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
      const biten = (x: MalzemeRow) => x.miktar <= 0
      if (biten(a) !== biten(b)) return biten(a) ? 1 : -1
      const dateA = a.kaynak_islem?.tarih ?? a.created_at
      const dateB = b.kaynak_islem?.tarih ?? b.created_at
      return dateB.localeCompare(dateA)
    })

  const kritik = malzemeler.filter(m => m.miktar <= m.min_miktar).length
  // Toplam değer = bağlı gider işlemlerinin tutarı toplamı
  const toplamDeger = malzemeler.reduce((s, m) => s + (m.kaynak_islem?.tutar ?? 0), 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stok Yönetimi</h1>
        <p className="text-muted-foreground text-sm">Malzeme ve stok takibi</p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <p>
          Yeni malzeme eklemek için <strong>Finans → Yeni İşlem → Gider → Malzeme</strong> kategorisini kullanın.
        </p>
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
                const kritikMi = m.miktar <= m.min_miktar
                // Birim maliyet = toplam tutar / miktar (nakliye dahil)
                const birimMaliyet = m.kaynak_islem && m.miktar > 0
                  ? m.kaynak_islem.tutar / m.miktar
                  : null
                // Birim fiyat = (tutar - nakliye) / miktar
                const birimFiyat = m.kaynak_islem && m.miktar > 0
                  ? (m.kaynak_islem.tutar - (m.kaynak_islem.nakliye_tutari ?? 0)) / m.miktar
                  : null
                return (
                  <div key={m.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{m.ad}</p>
                        {kritikMi && <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                        <Badge variant="outline" className="text-xs shrink-0">{m.kategori}</Badge>
                        {m.kaynak_islem && (
                          m.kaynak_islem.faturali
                            ? <FileCheck className="h-3.5 w-3.5 shrink-0 text-green-600" aria-label="Faturalı" />
                            : <FileX className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-label="Faturasız" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Min: {m.min_miktar} {m.birim}
                        {m.kaynak_islem?.tarih && ` · ${formatDate(m.kaynak_islem.tarih)}`}
                        {m.kaynak_islem?.nakliye_tutari != null && ` · Nakliye: ${formatCurrency(m.kaynak_islem.nakliye_tutari)}`}
                        {m.kaynak_islem?.nakliye_tutari != null && (
                          m.kaynak_islem.nakliye_faturali
                            ? <FileCheck className="inline h-3 w-3 ml-1 text-green-600" aria-label="Nakliye Faturalı" />
                            : <FileX className="inline h-3 w-3 ml-1 text-orange-400" aria-label="Nakliye Faturasız" />
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`font-semibold text-sm ${kritikMi ? "text-orange-500" : ""}`}>
                          {m.miktar} {m.birim}
                        </p>
                        {birimFiyat !== null && (
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(birimFiyat)}/{m.birim}
                          </p>
                        )}
                        {birimMaliyet !== null && (
                          <p className="text-xs font-medium text-blue-600">
                            Maliyet: {formatCurrency(birimMaliyet)}/{m.birim}
                          </p>
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
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Düzenleme dialogu — yalnızca tanımlayıcı bilgiler */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Malzemeyi Düzenle</DialogTitle>
          </DialogHeader>
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
