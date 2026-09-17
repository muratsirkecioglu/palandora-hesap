import { useEffect, useState } from "react"
import { Plus, Trash2, Loader2, Factory } from "lucide-react"
import { supabase, type MalzemeWithStok } from "@/lib/supabase"
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

interface UretimRow {
  id: string
  tarih: string
  miktar: number
  iscilik_tutari: number
  adam_saat: number | null
  aciklama: string | null
  malzeme_id: string
  malzeme: { ad: string; birim: string } | null
}

interface GirdiSatir {
  malzeme_id: string
  miktar: string
}

const defaultForm = {
  tarih: new Date().toISOString().slice(0, 10),
  malzeme_id: "",
  miktar: "",
  iscilik_tutari: "",
  adam_saat: "",
  aciklama: "",
}

export function Uretim() {
  const { user } = useAuth()
  const { aktifSirketId } = useSirket()
  const [uretimler, setUretimler] = useState<UretimRow[]>([])
  const [malzemeler, setMalzemeler] = useState<MalzemeWithStok[]>([])
  const [girdiMap, setGirdiMap] = useState<Map<string, { ad: string; miktar: number; birim: string; tutar: number }[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(defaultForm)
  const [girdiler, setGirdiler] = useState<GirdiSatir[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!aktifSirketId) return
    setLoading(true)

    const [{ data: uData }, { data: mData }, { data: sData }] = await Promise.all([
      supabase.from("uretimler")
        .select("id, tarih, miktar, iscilik_tutari, adam_saat, aciklama, malzeme_id, malzeme:malzemeler!malzeme_id(ad, birim)")
        .eq("sirket_id", aktifSirketId)
        .order("tarih", { ascending: false }),
      supabase.from("malzemeler").select("*").eq("sirket_id", aktifSirketId).order("ad"),
      supabase.from("islem_stok")
        .select("malzeme_id, miktar, tur, birim_fiyat, uretim_id")
        .eq("sirket_id", aktifSirketId),
    ])

    setUretimler((uData ?? []) as unknown as UretimRow[])

    // Stok = giriş - çıkış (tüm kaynaklar dahil)
    type StokRow = { malzeme_id: string; miktar: number; tur: string; birim_fiyat: number; uretim_id: string | null }
    const stokRows = (sData ?? []) as StokRow[]
    const stokMap = new Map<string, number>()
    const sonFiyat = new Map<string, number>()
    for (const s of stokRows) {
      stokMap.set(s.malzeme_id, (stokMap.get(s.malzeme_id) ?? 0) + (s.tur === "giris" ? s.miktar : -s.miktar))
      if (s.tur === "giris") sonFiyat.set(s.malzeme_id, s.birim_fiyat)
    }

    const malzemeList = ((mData ?? []) as import("@/lib/supabase").Malzeme[]).map(m => ({
      ...m,
      stok: stokMap.get(m.id) ?? 0,
      son_birim_fiyat: sonFiyat.get(m.id) ?? null,
      son_giris_islem: null,
    })) as MalzemeWithStok[]
    setMalzemeler(malzemeList)

    // Üretim başına tüketilen girdiler
    const adMap = new Map(malzemeList.map(m => [m.id, m]))
    const gMap = new Map<string, { ad: string; miktar: number; birim: string; tutar: number }[]>()
    for (const s of stokRows) {
      if (!s.uretim_id || s.tur !== "cikis") continue
      const m = adMap.get(s.malzeme_id)
      const list = gMap.get(s.uretim_id) ?? []
      list.push({
        ad: m?.ad ?? "—",
        miktar: s.miktar,
        birim: m?.birim ?? "",
        tutar: s.miktar * s.birim_fiyat,
      })
      gMap.set(s.uretim_id, list)
    }
    setGirdiMap(gMap)

    setLoading(false)
  }

  useEffect(() => { load() }, [aktifSirketId])

  function openNew() {
    setForm(defaultForm)
    setGirdiler([])
    setError(null)
    setDialogOpen(true)
  }

  function addGirdi() { setGirdiler(p => [...p, { malzeme_id: "", miktar: "" }]) }
  function removeGirdi(i: number) { setGirdiler(p => p.filter((_, idx) => idx !== i)) }
  function updateGirdi(i: number, field: keyof GirdiSatir, value: string) {
    setGirdiler(p => p.map((g, idx) => idx === i ? { ...g, [field]: value } : g))
  }

  function malzemeBirimFiyat(id: string) {
    return malzemeler.find(m => m.id === id)?.son_birim_fiyat ?? 0
  }

  const gecerliGirdiler = girdiler.filter(g => g.malzeme_id && (parseFloat(g.miktar) || 0) > 0)
  const malzemeMaliyeti = gecerliGirdiler.reduce(
    (s, g) => s + (parseFloat(g.miktar) || 0) * malzemeBirimFiyat(g.malzeme_id), 0)
  const iscilik = parseFloat(form.iscilik_tutari) || 0
  const uretilenMiktar = parseFloat(form.miktar) || 0
  const toplamMaliyet = malzemeMaliyeti + iscilik
  const birimMaliyet = uretilenMiktar > 0 ? toplamMaliyet / uretilenMiktar : 0

  async function handleSave() {
    if (!form.malzeme_id || uretilenMiktar <= 0) {
      setError("Üretilen ürün ve miktar zorunludur.")
      return
    }
    // Girdi stok yeterliliği
    for (const g of gecerliGirdiler) {
      const m = malzemeler.find(x => x.id === g.malzeme_id)
      const istenen = parseFloat(g.miktar) || 0
      if (m && istenen > m.stok) {
        setError(`${m.ad} için yeterli stok yok (mevcut: ${m.stok} ${m.birim}).`)
        return
      }
    }

    setSaving(true)
    setError(null)

    try {
      const { data: uretim, error: uErr } = await supabase.from("uretimler").insert({
        sirket_id: aktifSirketId,
        tarih: form.tarih,
        malzeme_id: form.malzeme_id,
        miktar: uretilenMiktar,
        iscilik_tutari: iscilik,
        adam_saat: form.adam_saat ? parseFloat(form.adam_saat) : null,
        aciklama: form.aciklama || null,
        kullanici_id: user!.id,
      }).select("id").single()
      if (uErr) { setError(uErr.message); return }

      const hareketler = [
        // Tüketilen hammaddeler
        ...gecerliGirdiler.map(g => ({
          uretim_id: uretim.id,
          malzeme_id: g.malzeme_id,
          miktar: parseFloat(g.miktar),
          tur: "cikis",
          birim_fiyat: malzemeBirimFiyat(g.malzeme_id),
          kaynak: "uretim",
          sirket_id: aktifSirketId,
        })),
        // Üretilen ürün
        {
          uretim_id: uretim.id,
          malzeme_id: form.malzeme_id,
          miktar: uretilenMiktar,
          tur: "giris",
          birim_fiyat: birimMaliyet,
          kaynak: "uretim",
          sirket_id: aktifSirketId,
        },
      ]

      const { error: sErr } = await supabase.from("islem_stok").insert(hareketler)
      if (sErr) {
        // Stok hareketi yazılamadıysa üretim kaydı yalnız kalmasın
        await supabase.from("uretimler").delete().eq("id", uretim.id)
        setError(sErr.message)
        return
      }

      setDialogOpen(false)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.")
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(u: UretimRow) {
    if (!confirm(`"${u.malzeme?.ad}" üretimini silmek istediğinize emin misiniz?\nTüketilen hammaddeler stoğa geri döner, üretilen ürün stoktan düşer.`)) return
    // islem_stok.uretim_id ON DELETE CASCADE — hareketler birlikte silinir
    const { error } = await supabase.from("uretimler").delete().eq("id", u.id)
    if (error) { alert("Silme hatası: " + error.message); return }
    load()
  }

  const uretilenler = malzemeler

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Üretim</h1>
          <p className="text-muted-foreground text-sm">Üretilen ürünler stoğa girer, kullanılan hammaddeler stoktan düşer</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4" /> Yeni Üretim
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b border-border">
          <CardTitle className="text-base">Üretim Kayıtları ({uretimler.length})</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 px-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : uretimler.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">Henüz üretim kaydı yok</p>
          ) : (
            <div className="divide-y divide-border px-6">
              {uretimler.map(u => {
                const girdi = girdiMap.get(u.id) ?? []
                const malzemeToplam = girdi.reduce((s, g) => s + g.tutar, 0)
                const toplam = malzemeToplam + (u.iscilik_tutari ?? 0)
                const birim = u.miktar > 0 ? toplam / u.miktar : 0
                return (
                  <div key={u.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Factory className="h-3.5 w-3.5 text-primary shrink-0" />
                        <p className="font-medium text-sm">{u.malzeme?.ad ?? "—"}</p>
                        <Badge variant="secondary" className="text-xs">
                          {u.miktar} {u.malzeme?.birim}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(u.tarih)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        {girdi.length > 0 ? (
                          <p>
                            Kullanılan: {girdi.map(g => `${g.ad} (${g.miktar} ${g.birim})`).join(" · ")}
                          </p>
                        ) : (
                          <p className="italic">Hammadde tüketimi girilmemiş</p>
                        )}
                        {(u.iscilik_tutari ?? 0) > 0 && (
                          <p>
                            İşçilik: {formatCurrency(u.iscilik_tutari)}
                            {u.adam_saat != null ? ` · ${u.adam_saat} adam/saat` : ""}
                          </p>
                        )}
                        {u.aciklama && <p className="italic">{u.aciklama}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <div className="text-right mr-1">
                        <p className="text-sm font-semibold">{formatCurrency(toplam)}</p>
                        <p className="text-[10px] text-muted-foreground">{formatCurrency(birim)}/{u.malzeme?.birim}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(u)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Yeni Üretim</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Üretilen Ürün *</Label>
                <Select value={form.malzeme_id} onValueChange={v => { setForm(f => ({ ...f, malzeme_id: v })); setError(null) }}>
                  <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                  <SelectContent>
                    {uretilenler.map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.ad} · {m.birim}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Üretilen Miktar *</Label>
                <Input
                  type="number" min="0" step="0.001"
                  value={form.miktar}
                  onChange={e => { setForm(f => ({ ...f, miktar: e.target.value })); setError(null) }}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tarih</Label>
                <Input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>İşçilik Tutarı (₺)</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.iscilik_tutari}
                  onChange={e => setForm(f => ({ ...f, iscilik_tutari: e.target.value }))}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Adam/Saat (isteğe bağlı)</Label>
              <Input
                type="number" min="0" step="0.5"
                value={form.adam_saat}
                onChange={e => setForm(f => ({ ...f, adam_saat: e.target.value }))}
                placeholder="0"
              />
            </div>

            {/* Kullanılan hammaddeler */}
            <div className="space-y-3 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Kullanılan Hammaddeler</p>
                <Button variant="outline" size="sm" onClick={addGirdi} className="gap-1 text-xs h-7">
                  <Plus className="h-3 w-3" /> Ekle
                </Button>
              </div>
              {girdiler.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  İsteğe bağlı. Girersen bu malzemeler stoktan düşer ve ürünün birim maliyeti otomatik hesaplanır.
                </p>
              ) : (
                <div className="space-y-2">
                  {girdiler.map((g, i) => {
                    const m = malzemeler.find(x => x.id === g.malzeme_id)
                    return (
                      <div key={i} className="grid grid-cols-[1fr_auto_32px] gap-2 items-end">
                        <div className="space-y-1">
                          {i === 0 && <Label className="text-xs">Malzeme</Label>}
                          <Select value={g.malzeme_id} onValueChange={v => { updateGirdi(i, "malzeme_id", v); setError(null) }}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seçin..." /></SelectTrigger>
                            <SelectContent>
                              {malzemeler.filter(x => x.stok > 0 || x.id === g.malzeme_id).map(x => (
                                <SelectItem key={x.id} value={x.id}>
                                  {x.ad} · {x.stok} {x.birim}
                                  {x.son_birim_fiyat ? ` · ${formatCurrency(x.son_birim_fiyat)}/${x.birim}` : ""}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          {i === 0 && <Label className="text-xs">Miktar</Label>}
                          <div className="flex items-center gap-1">
                            <Input
                              className="h-8 text-xs w-20" type="number" min="0" step="0.001"
                              value={g.miktar}
                              onChange={e => { updateGirdi(i, "miktar", e.target.value); setError(null) }}
                              placeholder="0"
                            />
                            {m && <span className="text-xs text-muted-foreground whitespace-nowrap">{m.birim}</span>}
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeGirdi(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Maliyet özeti */}
            {(toplamMaliyet > 0 || uretilenMiktar > 0) && (
              <div className="rounded-md border border-border divide-y divide-border text-xs">
                <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                  <span>Hammadde Maliyeti</span>
                  <span className="font-medium">{formatCurrency(malzemeMaliyeti)}</span>
                </div>
                {iscilik > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                    <span>İşçilik</span>
                    <span className="font-medium">{formatCurrency(iscilik)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-2">
                  <span className="font-medium">Toplam Maliyet</span>
                  <span className="font-semibold">{formatCurrency(toplamMaliyet)}</span>
                </div>
                {uretilenMiktar > 0 && (
                  <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                    <span className="font-medium">Birim Maliyet</span>
                    <span className="font-semibold text-primary">{formatCurrency(birimMaliyet)}</span>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Açıklama (isteğe bağlı)</Label>
              <Input value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="Parti no, notlar..." />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Üretimi Kaydet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
