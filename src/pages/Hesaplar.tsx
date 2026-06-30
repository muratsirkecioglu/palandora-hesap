import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, Banknote, CreditCard, Landmark, Wallet, User, ArrowLeftRight, X } from "lucide-react"
import { supabase, type Hesap } from "@/lib/supabase"
import { TransferDialog } from "./TransferDialog"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"

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
  cariBorcVerilen: number
  cariIadeEdilen: number
}

interface Hareket {
  id: string
  tarih: string
  tutar: number
  aciklama: string | null
  islem: { aciklama: string; tur: string; kategori: string } | null
  bakiye: number
}

const SAHIP_LABEL: Record<string, string> = {
  sirket: "Şirket",
  ortak: "Ortak",
  calisan: "Çalışan",
}

const defaultForm = {
  ad: "",
  tur: "banka" as Hesap["tur"],
  sahip_tipi: "sirket" as Hesap["sahip_tipi"],
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
  const [selectedHesapId, setSelectedHesapId] = useState<string | null>(null)
  const [hareketler, setHareketler] = useState<Hareket[]>([])
  const [hareketLoading, setHareketLoading] = useState(false)

  async function load() {
    setLoading(true)
    const [{ data: hesapData }, { data: odemeData }] = await Promise.all([
      supabase.from("hesaplar").select("*").order("ad"),
      supabase.from("odemeler")
        .select("hesap_id, tutar, islem:islemler!islem_id(tur, kategori)")
        .not("hesap_id", "is", null),
    ])

    type OdemeRow = { hesap_id: string; tutar: number; islem: { tur: string; kategori: string } | null }
    const odemeler = (odemeData ?? []) as unknown as OdemeRow[]

    const rows: HesapRow[] = (hesapData ?? []).map((h: Hesap) => {
      const linked = odemeler.filter(o => o.hesap_id === h.id && o.islem)
      const gelir = linked.filter(o => o.islem!.tur === "gelir").reduce((s, o) => s + o.tutar, 0)
      const gider = linked.filter(o => o.islem!.tur === "gider").reduce((s, o) => s + o.tutar, 0)
      const cari = linked.filter(o => o.islem!.kategori === "Cari Hesap")
      const cariBorcVerilen = cari.filter(o => o.islem!.tur === "gider").reduce((s, o) => s + o.tutar, 0)
      const cariIadeEdilen = cari.filter(o => o.islem!.tur === "gelir").reduce((s, o) => s + o.tutar, 0)
      return { ...h, gelir, gider, bakiye: h.bakiye_baslangic + gelir - gider, cariBorcVerilen, cariIadeEdilen }
    })

    setHesaplar(rows)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!selectedHesapId) { setHareketler([]); return }
    setHareketLoading(true)

    type RawRow = { id: string; tarih: string; tutar: number; aciklama: string | null; islem: { aciklama: string; tur: string; kategori: string } | null }

    supabase.from("odemeler")
      .select("id, tarih, tutar, aciklama, islem:islemler!islem_id(aciklama, tur, kategori)")
      .eq("hesap_id", selectedHesapId)
      .order("tarih", { ascending: true })
      .then(({ data }) => {
        const hesap = hesaplar.find(h => h.id === selectedHesapId)
        const baslangic = hesap?.bakiye_baslangic ?? 0
        let bakiye = baslangic
        const rows = ((data ?? []) as unknown as RawRow[]).map(o => {
          const delta = o.islem?.tur === "gelir" ? o.tutar : -o.tutar
          bakiye += delta
          return { ...o, bakiye }
        })
        setHareketler(rows.reverse())
        setHareketLoading(false)
      })
  }, [selectedHesapId, hesaplar])

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
      sahip_tipi: h.sahip_tipi,
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
      sahip_tipi: form.sahip_tipi,
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
    if (selectedHesapId === id) setSelectedHesapId(null)
    load()
  }

  const toplamBakiye = hesaplar.filter(h => h.aktif).reduce((s, h) => s + h.bakiye, 0)
  const toplamGelir = hesaplar.reduce((s, h) => s + h.gelir, 0)
  const toplamGider = hesaplar.reduce((s, h) => s + h.gider, 0)
  const selectedHesap = hesaplar.find(h => h.id === selectedHesapId) ?? null

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
          {hesaplar.map(h => {
            const isSelected = h.id === selectedHesapId
            return (
              <Card
                key={h.id}
                className={`cursor-pointer transition-all ${h.aktif ? "" : "opacity-60"} ${isSelected ? "ring-2 ring-primary" : "hover:ring-1 hover:ring-border"}`}
                onClick={() => setSelectedHesapId(isSelected ? null : h.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? "bg-primary text-primary-foreground" : "bg-primary/10"}`}>
                        <TurIcon tur={h.tur} className={`h-4 w-4 ${isSelected ? "text-primary-foreground" : "text-primary"}`} />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold">{h.ad}</CardTitle>
                        <p className="text-xs text-muted-foreground">{TUR_LABEL[h.tur]} · {h.para_birimi}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {h.sahip_tipi !== "sirket" && (
                        <Badge variant="outline" className="text-xs">{SAHIP_LABEL[h.sahip_tipi]}</Badge>
                      )}
                      {!h.aktif && <Badge variant="outline" className="text-xs">Pasif</Badge>}
                    </div>
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
                  {h.sahip_tipi !== "sirket" && (h.cariBorcVerilen > 0 || h.cariIadeEdilen > 0) && (() => {
                    const net = h.cariBorcVerilen - h.cariIadeEdilen
                    return (
                      <div className="rounded-lg border border-border p-3 space-y-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Cari Hesap</p>
                        <div className="grid grid-cols-2 gap-2 text-center text-xs">
                          <div>
                            <p className="text-muted-foreground">Borç Verilen</p>
                            <p className="font-medium">{formatCurrency(h.cariBorcVerilen)}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">İade Edilen</p>
                            <p className="font-medium">{formatCurrency(h.cariIadeEdilen)}</p>
                          </div>
                        </div>
                        <div className={`text-center text-xs font-semibold rounded-md py-1 ${net > 0.005 ? "bg-orange-50 text-orange-600" : net < -0.005 ? "bg-blue-50 text-blue-600" : "bg-muted text-muted-foreground"}`}>
                          {net > 0.005 ? `Şirket Borçlu: ${formatCurrency(net)}` : net < -0.005 ? `${SAHIP_LABEL[h.sahip_tipi]} Borçlu: ${formatCurrency(-net)}` : "Hesap Kapalı"}
                        </div>
                      </div>
                    )
                  })()}
                  {h.notlar && <p className="text-xs text-muted-foreground italic">{h.notlar}</p>}
                  {isAdmin && (
                    <div className="flex justify-end gap-1 pt-1 border-t border-border" onClick={e => e.stopPropagation()}>
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
            )
          })}
        </div>
      )}

      {/* Hesap Hareketleri */}
      {selectedHesap && (
        <Card>
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TurIcon tur={selectedHesap.tur} className="h-4 w-4 text-primary" />
                  {selectedHesap.ad} — Hareketler
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">{hareketler.length} kayıt</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedHesapId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-0">
            {hareketLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : hareketler.length === 0 ? (
              <p className="text-center text-muted-foreground py-10 text-sm">Bu hesapta kayıtlı hareket yok</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left font-medium px-4 py-2">Tarih</th>
                      <th className="text-left font-medium px-3 py-2">Açıklama</th>
                      <th className="text-left font-medium px-3 py-2 hidden sm:table-cell">Kategori</th>
                      <th className="text-right font-medium px-3 py-2">Tutar</th>
                      <th className="text-right font-medium px-4 py-2">Bakiye</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {hareketler.map(h => {
                      const gelirMi = h.islem?.tur === "gelir"
                      return (
                        <tr key={h.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2 whitespace-nowrap text-muted-foreground">
                            {formatDate(h.tarih)}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-medium flex items-center gap-1.5">
                              {h.islem?.aciklama ?? "—"}
                              {h.islem?.kategori === "Cari Hesap" && (
                                <Badge variant="outline" className="text-[10px] py-0">Cari</Badge>
                              )}
                            </p>
                            {h.aciklama && <p className="text-muted-foreground">{h.aciklama}</p>}
                          </td>
                          <td className="px-3 py-2 hidden sm:table-cell text-muted-foreground">
                            {h.islem?.kategori ?? "—"}
                          </td>
                          <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${gelirMi ? "text-green-600" : "text-red-500"}`}>
                            {gelirMi ? "+" : "-"}{formatCurrency(h.tutar)}
                          </td>
                          <td className={`px-4 py-2 text-right font-medium whitespace-nowrap ${h.bakiye >= 0 ? "text-foreground" : "text-red-500"}`}>
                            {formatCurrency(h.bakiye)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                      <td colSpan={3} className="px-4 py-2 hidden sm:table-cell">Güncel Bakiye</td>
                      <td colSpan={2} className="px-4 py-2 sm:hidden">Güncel Bakiye</td>
                      <td colSpan={2} className={`px-4 py-2 text-right hidden sm:table-cell ${selectedHesap.bakiye >= 0 ? "text-green-600" : "text-red-500"}`}>
                        {formatCurrency(selectedHesap.bakiye)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
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
              <Label>Hesap Sahibi</Label>
              <Select value={form.sahip_tipi} onValueChange={v => f("sahip_tipi", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sirket">Şirket</SelectItem>
                  <SelectItem value="ortak">Ortak</SelectItem>
                  <SelectItem value="calisan">Çalışan</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Şirket hesabı ile Ortak/Çalışan hesabı arasındaki transferler otomatik "Cari Hesap" olarak izlenir.</p>
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
