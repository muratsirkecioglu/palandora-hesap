import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, AlertTriangle } from "lucide-react"
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

const defaultForm = {
  ad: "", kategori: "Hammadde", miktar: "", birim: "Adet",
  min_miktar: "", birim_fiyat: "", aciklama: "", alis_tarihi: "", faturali: true, nakliye_tutari: "",
}

export function Stok() {
  const { isAdmin, user } = useAuth()
  const [malzemeler, setMalzemeler] = useState<Malzeme[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Malzeme | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState("")
  const [filterKat, setFilterKat] = useState("tumu")

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("malzemeler").select("*").order("ad")
    setMalzemeler((data ?? []) as Malzeme[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function f(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function openNew() {
    setEditing(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  function openEdit(m: Malzeme) {
    setEditing(m)
    setForm({
      ad: m.ad, kategori: m.kategori, miktar: String(m.miktar),
      birim: m.birim, min_miktar: String(m.min_miktar),
      birim_fiyat: String(m.birim_fiyat), aciklama: m.aciklama ?? "",
      alis_tarihi: m.alis_tarihi ?? "", faturali: m.faturali,
      nakliye_tutari: m.nakliye_tutari != null ? String(m.nakliye_tutari) : "",
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.ad || !form.miktar) return
    setSaving(true)
    const payload = {
      ad: form.ad, kategori: form.kategori,
      miktar: parseFloat(form.miktar) || 0,
      birim: form.birim,
      min_miktar: parseFloat(form.min_miktar) || 0,
      birim_fiyat: parseFloat(form.birim_fiyat) || 0,
      aciklama: form.aciklama,
      alis_tarihi: form.alis_tarihi || null,
      faturali: form.faturali,
      nakliye_tutari: form.nakliye_tutari ? parseFloat(form.nakliye_tutari) : null,
      kullanici_id: user!.id,
    }
    if (editing) {
      await supabase.from("malzemeler").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editing.id)
    } else {
      await supabase.from("malzemeler").insert(payload)
    }
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu malzemeyi silmek istediğinize emin misiniz?")) return
    await supabase.from("malzemeler").delete().eq("id", id)
    load()
  }

  const filtered = malzemeler.filter(m => {
    const matchSearch = m.ad.toLowerCase().includes(search.toLowerCase())
    const matchKat = filterKat === "tumu" || m.kategori === filterKat
    return matchSearch && matchKat
  })

  const kritik = malzemeler.filter(m => m.miktar <= m.min_miktar).length
  const toplamDeger = malzemeler.reduce((s, m) => s + m.miktar * m.birim_fiyat, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Stok Yönetimi</h1>
          <p className="text-muted-foreground text-sm">Malzeme ve stok takibi</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4" />
          Yeni Malzeme
        </Button>
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
                return (
                  <div key={m.id} className="flex items-center justify-between py-3 gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{m.ad}</p>
                        {kritikMi && <AlertTriangle className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                        <Badge variant="outline" className="text-xs shrink-0">{m.kategori}</Badge>
                        <Badge variant={m.faturali ? "success" : "warning"} className="text-xs shrink-0">
                          {m.faturali ? "Faturalı" : "Faturasız"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Min: {m.min_miktar} {m.birim} · {formatCurrency(m.birim_fiyat)}/{m.birim}
                        {m.alis_tarihi && ` · Alış: ${formatDate(m.alis_tarihi)}`}
                        {m.nakliye_tutari != null && ` · Nakliye: ${formatCurrency(m.nakliye_tutari)}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className={`font-semibold text-sm ${kritikMi ? "text-orange-500" : ""}`}>
                          {m.miktar} {m.birim}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatCurrency(m.miktar * m.birim_fiyat)}</p>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Malzemeyi Düzenle" : "Yeni Malzeme"}</DialogTitle>
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
              <Label>Alış Tarihi (isteğe bağlı)</Label>
              <Input type="date" value={form.alis_tarihi} onChange={e => f("alis_tarihi", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Stok Miktarı</Label>
                <Input type="number" min="0" value={form.miktar} onChange={e => f("miktar", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Min. Miktar</Label>
                <Input type="number" min="0" value={form.min_miktar} onChange={e => f("min_miktar", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Birim Fiyat (₺)</Label>
                <Input type="number" min="0" step="0.01" value={form.birim_fiyat} onChange={e => f("birim_fiyat", e.target.value)} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Açıklama (isteğe bağlı)</Label>
              <Input value={form.aciklama} onChange={e => f("aciklama", e.target.value)} placeholder="Notlar..." />
            </div>
            <div className="space-y-1.5">
              <Label>Nakliye Tutarı (₺) — isteğe bağlı</Label>
              <Input type="number" min="0" step="0.01" value={form.nakliye_tutari} onChange={e => f("nakliye_tutari", e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="faturali"
                checked={form.faturali}
                onChange={e => setForm(p => ({ ...p, faturali: e.target.checked }))}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="faturali" className="text-sm font-medium cursor-pointer">Faturalı</label>
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
