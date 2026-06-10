import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { supabase, type Islem } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"

const KATEGORILER = ["Satış", "Hizmet", "Kira", "Maaş", "Malzeme", "Fatura", "Vergi", "Diğer"]

const defaultForm = {
  tarih: new Date().toISOString().slice(0, 10),
  aciklama: "",
  tutar: "",
  tur: "gelir" as "gelir" | "gider",
  kategori: "Diğer",
}

export function Finans() {
  const { isAdmin, user } = useAuth()
  const [islemler, setIslemler] = useState<Islem[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Islem | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<"tumu" | "gelir" | "gider">("tumu")

  async function load() {
    setLoading(true)
    const q = supabase.from("islemler").select("*").order("tarih", { ascending: false })
    if (!isAdmin) q.eq("kullanici_id", user!.id)
    const { data } = await q
    setIslemler((data ?? []) as Islem[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() {
    setEditing(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  function openEdit(islem: Islem) {
    setEditing(islem)
    setForm({ tarih: islem.tarih, aciklama: islem.aciklama, tutar: String(islem.tutar), tur: islem.tur, kategori: islem.kategori })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.aciklama || !form.tutar || !form.tarih) return
    setSaving(true)
    const payload = {
      tarih: form.tarih,
      aciklama: form.aciklama,
      tutar: parseFloat(form.tutar),
      tur: form.tur,
      kategori: form.kategori,
      kullanici_id: user!.id,
    }
    if (editing) {
      await supabase.from("islemler").update(payload).eq("id", editing.id)
    } else {
      await supabase.from("islemler").insert(payload)
    }
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu işlemi silmek istediğinize emin misiniz?")) return
    await supabase.from("islemler").delete().eq("id", id)
    load()
  }

  const filtered = islemler.filter(i => filter === "tumu" || i.tur === filter)
  const toplamGelir = islemler.filter(i => i.tur === "gelir").reduce((s, i) => s + i.tutar, 0)
  const toplamGider = islemler.filter(i => i.tur === "gider").reduce((s, i) => s + i.tutar, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Finans</h1>
          <p className="text-muted-foreground text-sm">Gelir ve gider takibi</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4" />
          Yeni İşlem
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Toplam Gelir</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(toplamGelir)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Toplam Gider</p>
            <p className="text-lg font-bold text-red-500">{formatCurrency(toplamGider)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">Net Bakiye</p>
            <p className={`text-lg font-bold ${toplamGelir - toplamGider >= 0 ? "text-blue-600" : "text-red-500"}`}>
              {formatCurrency(toplamGelir - toplamGider)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">İşlem Listesi</CardTitle>
            <div className="flex gap-1">
              {(["tumu", "gelir", "gider"] as const).map(f => (
                <Button key={f} variant={filter === f ? "default" : "ghost"} size="sm" onClick={() => setFilter(f)}>
                  {f === "tumu" ? "Tümü" : f === "gelir" ? "Gelir" : "Gider"}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">İşlem bulunamadı</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(islem => (
                <div key={islem.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{islem.aciklama}</p>
                      <Badge variant={islem.tur === "gelir" ? "success" : "destructive"} className="shrink-0">
                        {islem.tur === "gelir" ? "Gelir" : "Gider"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{formatDate(islem.tarih)} · {islem.kategori}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold text-sm ${islem.tur === "gelir" ? "text-green-600" : "text-red-500"}`}>
                      {islem.tur === "gelir" ? "+" : "-"}{formatCurrency(islem.tutar)}
                    </span>
                    {(isAdmin || islem.kullanici_id === user?.id) && (
                      <>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(islem)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(islem.id)}>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "İşlemi Düzenle" : "Yeni İşlem"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tür</Label>
                <Select value={form.tur} onValueChange={v => setForm(f => ({ ...f, tur: v as "gelir" | "gider" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gelir">Gelir</SelectItem>
                    <SelectItem value="gider">Gider</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={form.kategori} onValueChange={v => setForm(f => ({ ...f, kategori: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Açıklama</Label>
              <Input value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="İşlem açıklaması" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tutar (₺)</Label>
                <Input type="number" min="0" step="0.01" value={form.tutar} onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="space-y-1.5">
                <Label>Tarih</Label>
                <Input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} />
              </div>
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
