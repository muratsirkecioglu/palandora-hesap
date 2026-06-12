import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, Banknote, CreditCard, Landmark, Wallet, User, ArrowLeftRight } from "lucide-react"
import { supabase, type Hesap, type Islem } from "@/lib/supabase"
import { TransferDialog } from "./TransferDialog"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

const TUR_LABEL: Record<string, string> = {
  banka: "Banka",
  kasa: "Kasa",
  kredi_karti: "Kredi Kartı",
  kisi: "Kişi",
  diger: "Diğer",
}

function TurIcon({ tur, className }: { tur: string; className?: string }) {
  if (tur === "banka") return <Landmark className={className} />
  if (tur === "kasa") return <Banknote className={className} />
  if (tur === "kredi_karti") return <CreditCard className={className} />
  if (tur === "kisi") return <User className={className} />
  return <Wallet className={className} />
}

interface HesapRow extends Hesap {
  gelir: number
  gider: number
  bakiye: number
}

const defaultForm = {
  ad: "",
  tur: "banka" as Hesap["tur"],
  para_birimi: "TRY",
  bakiye_baslangic: "",
  notlar: "",
  aktif: true,
}

export function Hesaplar() {
  const { isAdmin } = useAuth()
  const [hesaplar, setHesaplar] = useState<HesapRow[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [editing, setEditing] = useState<Hesap | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: hesapData }, { data: islemData }] = await Promise.all([
      supabase.from("hesaplar").select("*").order("ad"),
      supabase.from("islemler").select("hesap_id, tur, tutar").not("hesap_id", "is", null),
    ])

    const islemler = (islemData ?? []) as Pick<Islem, "hesap_id" | "tur" | "tutar">[]

    const rows: HesapRow[] = (hesapData ?? []).map((h: Hesap) => {
      const linked = islemler.filter(i => i.hesap_id === h.id)
      const gelir = linked.filter(i => i.tur === "gelir").reduce((s, i) => s + i.tutar, 0)
      const gider = linked.filter(i => i.tur === "gider").reduce((s, i) => s + i.tutar, 0)
      return { ...h, gelir, gider, bakiye: h.bakiye_baslangic + gelir - gider }
    })

    setHesaplar(rows)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function f(field: string, value: string | boolean) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function openNew() {
    setEditing(null)
    setForm(defaultForm)
    setDialogOpen(true)
  }

  function openEdit(h: Hesap) {
    setEditing(h)
    setForm({
      ad: h.ad,
      tur: h.tur,
      para_birimi: h.para_birimi,
      bakiye_baslangic: String(h.bakiye_baslangic),
      notlar: h.notlar ?? "",
      aktif: h.aktif,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.ad) return
    setSaving(true)
    const payload = {
      ad: form.ad,
      tur: form.tur,
      para_birimi: form.para_birimi,
      bakiye_baslangic: parseFloat(form.bakiye_baslangic) || 0,
      notlar: form.notlar || null,
      aktif: form.aktif,
      updated_at: new Date().toISOString(),
    }
    if (editing) {
      await supabase.from("hesaplar").update(payload).eq("id", editing.id)
    } else {
      await supabase.from("hesaplar").insert(payload)
    }
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu hesabı silmek istediğinize emin misiniz?\nBağlı işlemlerin hesap ilişkisi kaldırılacak.")) return
    await supabase.from("hesaplar").delete().eq("id", id)
    load()
  }

  const toplamBakiye = hesaplar.filter(h => h.aktif).reduce((s, h) => s + h.bakiye, 0)
  const toplamGelir = hesaplar.reduce((s, h) => s + h.gelir, 0)
  const toplamGider = hesaplar.reduce((s, h) => s + h.gider, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Hesaplar</h1>
          <p className="text-muted-foreground text-sm">Banka, kasa ve diğer hesaplar</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)} disabled={hesaplar.filter(h => h.aktif).length < 2}>
            <ArrowLeftRight className="h-4 w-4" /> Transfer
          </Button>
          {isAdmin && (
            <Button onClick={openNew} size="sm">
              <Plus className="h-4 w-4" /> Yeni Hesap
            </Button>
          )}
        </div>
      </div>

      {/* Özet */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Bakiye</p>
          <p className={`text-lg font-bold ${toplamBakiye >= 0 ? "text-green-600" : "text-red-500"}`}>{formatCurrency(toplamBakiye)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Giren</p>
          <p className="text-lg font-bold text-green-600">{formatCurrency(toplamGelir)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Çıkan</p>
          <p className="text-lg font-bold text-red-500">{formatCurrency(toplamGider)}</p>
        </CardContent></Card>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : hesaplar.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground text-sm">Henüz hesap tanımlanmamış</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hesaplar.map(h => (
            <Card key={h.id} className={h.aktif ? "" : "opacity-60"}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <TurIcon tur={h.tur} className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">{h.ad}</CardTitle>
                      <p className="text-xs text-muted-foreground">{TUR_LABEL[h.tur]} · {h.para_birimi}</p>
                    </div>
                  </div>
                  {!h.aktif && <Badge variant="outline" className="text-xs">Pasif</Badge>}
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                <div className="rounded-lg bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-0.5">Güncel Bakiye</p>
                  <p className={`text-xl font-bold ${h.bakiye >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {formatCurrency(h.bakiye)}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Başlangıç</p>
                    <p className="font-medium">{formatCurrency(h.bakiye_baslangic)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Giren</p>
                    <p className="font-medium text-green-600">+{formatCurrency(h.gelir)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Çıkan</p>
                    <p className="font-medium text-red-500">-{formatCurrency(h.gider)}</p>
                  </div>
                </div>
                {h.notlar && <p className="text-xs text-muted-foreground italic">{h.notlar}</p>}
                {isAdmin && (
                  <div className="flex justify-end gap-1 pt-1 border-t border-border">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(h)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(h.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Hesabı Düzenle" : "Yeni Hesap"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Hesap Adı *</Label>
              <Input value={form.ad} onChange={e => f("ad", e.target.value)} placeholder="ör. Ziraat Bankası, Kasa" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tür</Label>
                <Select value={form.tur} onValueChange={v => f("tur", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banka">Banka</SelectItem>
                    <SelectItem value="kasa">Kasa</SelectItem>
                    <SelectItem value="kredi_karti">Kredi Kartı</SelectItem>
                    <SelectItem value="kisi">Kişi</SelectItem>
                    <SelectItem value="diger">Diğer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Para Birimi</Label>
                <Select value={form.para_birimi} onValueChange={v => f("para_birimi", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRY">TRY (₺)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Başlangıç Bakiyesi (₺)</Label>
              <Input type="number" step="0.01" value={form.bakiye_baslangic} onChange={e => f("bakiye_baslangic", e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Notlar (isteğe bağlı)</Label>
              <Input value={form.notlar} onChange={e => f("notlar", e.target.value)} placeholder="Hesap açıklaması..." />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="aktif"
                checked={form.aktif}
                onChange={e => f("aktif", e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="aktif" className="text-sm font-medium cursor-pointer">Aktif</label>
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

      <TransferDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        hesaplar={hesaplar}
        onSaved={load}
      />
    </div>
  )
}
