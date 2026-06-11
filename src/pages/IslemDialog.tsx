import { useEffect, useState, useMemo } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { supabase, type Islem, type Malzeme } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

const KATEGORILER = ["Satış", "Hizmet", "Kira", "Maaş", "Malzeme", "Fatura", "Vergi", "Diğer"]
const MALZEME_KATEGORILER = ["Hammadde", "Yarı Mamul", "Mamul", "Sarf Malzeme", "Ekipman", "Diğer"]
const BIRIMLER = ["Adet", "Kg", "Lt", "m", "m²", "m³", "Paket", "Kutu", "Ton"]

interface StokSatir {
  malzeme_id: string
  miktar: string
  birim_fiyat: string
}

interface MalzemeAlt {
  ad: string
  mal_kategori: string
  birim: string
  miktar: string
  min_miktar: string
  faturali: boolean
  nakliye_tutari: string
}

const defaultMalzemeAlt: MalzemeAlt = {
  ad: "",
  mal_kategori: "Hammadde",
  birim: "Adet",
  miktar: "",
  min_miktar: "0",
  faturali: true,
  nakliye_tutari: "",
}

interface Props {
  open: boolean
  onClose: () => void
  editing: Islem | null
  malzemeler: Malzeme[]
  onSaved: () => void
}

const defaultForm = {
  tarih: new Date().toISOString().slice(0, 10),
  aciklama: "",
  tutar: "",
  tur: "gelir" as "gelir" | "gider",
  kategori: "Diğer",
  odeme_durumu: "odendi" as "odendi" | "kismi_odendi" | "beklemede",
  ilk_odeme: "",
  vade_tarihi: "",
  notlar: "",
  adam_saat: "",
}

export function IslemDialog({ open, onClose, editing, malzemeler, onSaved }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState(defaultForm)
  const [stokSatirlar, setStokSatirlar] = useState<StokSatir[]>([])
  const [stokEkle, setStokEkle] = useState(false)
  const [malzemeAlt, setMalzemeAlt] = useState<MalzemeAlt>(defaultMalzemeAlt)
  const [linkedMalzemeId, setLinkedMalzemeId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // gider + Malzeme kategorisi mi?
  const isMalzemeGider = form.tur === "gider" && form.kategori === "Malzeme"

  // birim_fiyat = (tutar - nakliye) / miktar — anlık hesap
  const hesapBirimFiyat = useMemo(() => {
    const tutar = parseFloat(form.tutar) || 0
    const miktar = parseFloat(malzemeAlt.miktar) || 0
    const nakliye = parseFloat(malzemeAlt.nakliye_tutari) || 0
    if (miktar <= 0 || tutar <= 0) return null
    return (tutar - nakliye) / miktar
  }, [form.tutar, malzemeAlt.miktar, malzemeAlt.nakliye_tutari])

  useEffect(() => {
    if (!open) return
    setError(null)
    setLinkedMalzemeId(null)
    setMalzemeAlt(defaultMalzemeAlt)

    if (editing) {
      setForm({
        tarih: editing.tarih,
        aciklama: editing.aciklama,
        tutar: String(editing.tutar),
        tur: editing.tur,
        kategori: editing.kategori,
        odeme_durumu: editing.odeme_durumu,
        ilk_odeme: "",
        vade_tarihi: editing.vade_tarihi ?? "",
        notlar: editing.notlar ?? "",
        adam_saat: editing.adam_saat != null ? String(editing.adam_saat) : "",
      })

      if (editing.tur === "gider" && editing.kategori === "Malzeme") {
        // Bağlı malzemeyi yükle
        supabase
          .from("malzemeler")
          .select("*")
          .eq("kaynak_islem_id", editing.id)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setLinkedMalzemeId(data.id)
              setMalzemeAlt({
                ad: data.ad,
                mal_kategori: data.kategori,
                birim: data.birim,
                miktar: String(data.miktar),
                min_miktar: String(data.min_miktar),
                faturali: data.faturali,
                nakliye_tutari: data.nakliye_tutari != null ? String(data.nakliye_tutari) : "",
              })
            }
          })
      } else {
        // Diğer türler için islem_stok satırlarını yükle
        supabase.from("islem_stok").select("*").eq("islem_id", editing.id).then(({ data }) => {
          if (data && data.length > 0) {
            setStokEkle(true)
            setStokSatirlar(data.map(s => ({
              malzeme_id: s.malzeme_id,
              miktar: String(s.miktar),
              birim_fiyat: String(s.birim_fiyat),
            })))
          } else {
            setStokEkle(false)
            setStokSatirlar([])
          }
        })
      }
    } else {
      setForm(defaultForm)
      setStokEkle(false)
      setStokSatirlar([])
    }
  }, [open, editing])

  function setF(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function setMA(field: keyof MalzemeAlt, value: string | boolean) {
    setMalzemeAlt(prev => ({ ...prev, [field]: value }))
  }

  function addStokSatir() {
    setStokSatirlar(prev => [...prev, { malzeme_id: "", miktar: "", birim_fiyat: "" }])
  }

  function removeStokSatir(i: number) {
    setStokSatirlar(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateStokSatir(i: number, field: keyof StokSatir, value: string) {
    setStokSatirlar(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  function onMalzemeSelect(i: number, malzemeId: string) {
    const m = malzemeler.find(m => m.id === malzemeId)
    setStokSatirlar(prev => prev.map((s, idx) =>
      idx === i ? { ...s, malzeme_id: malzemeId, birim_fiyat: m ? String(m.birim_fiyat) : "" } : s
    ))
  }

  async function handleSave() {
    if (!form.aciklama || !form.tutar || !form.tarih) return

    // Malzeme gider ise alt form zorunlu
    if (isMalzemeGider && (!malzemeAlt.ad || !malzemeAlt.miktar)) {
      setError("Stok bilgisi için malzeme adı ve miktar zorunludur.")
      return
    }

    setSaving(true)
    setError(null)

    const toplam = parseFloat(form.tutar)
    const islemPayload = {
      tarih: form.tarih,
      aciklama: form.aciklama,
      tutar: toplam,
      tur: form.tur,
      kategori: form.kategori,
      odeme_durumu: form.odeme_durumu,
      odenen_tutar: form.odeme_durumu === "odendi" ? toplam
        : form.odeme_durumu === "kismi_odendi" ? parseFloat(form.ilk_odeme || "0")
        : 0,
      vade_tarihi: form.vade_tarihi || null,
      notlar: form.notlar || null,
      adam_saat: form.adam_saat ? parseFloat(form.adam_saat) : null,
      kullanici_id: user!.id,
    }

    let islemId: string

    if (editing) {
      const { error } = await supabase.from("islemler").update(islemPayload).eq("id", editing.id)
      if (error) { setError(error.message); setSaving(false); return }
      islemId = editing.id

      if (!isMalzemeGider) {
        await supabase.from("islem_stok").delete().eq("islem_id", islemId)
      }
    } else {
      const { data, error } = await supabase.from("islemler").insert(islemPayload).select().single()
      if (error) { setError(error.message); setSaving(false); return }
      islemId = data.id

      if (form.odeme_durumu === "odendi") {
        await supabase.from("odemeler").insert({
          islem_id: islemId, tarih: form.tarih, tutar: toplam,
          aciklama: "Tam ödeme", kullanici_id: user!.id,
        })
      } else if (form.odeme_durumu === "kismi_odendi" && parseFloat(form.ilk_odeme || "0") > 0) {
        await supabase.from("odemeler").insert({
          islem_id: islemId, tarih: form.tarih, tutar: parseFloat(form.ilk_odeme),
          aciklama: "İlk ödeme", kullanici_id: user!.id,
        })
      }
    }

    // ── Malzeme gider: tek stok kaydı oluştur / güncelle ──────────────────
    if (isMalzemeGider) {
      const miktar = parseFloat(malzemeAlt.miktar) || 0
      const nakliye = malzemeAlt.nakliye_tutari ? parseFloat(malzemeAlt.nakliye_tutari) : null
      const birimFiyat = miktar > 0 ? (toplam - (nakliye ?? 0)) / miktar : 0

      const malzemePayload = {
        ad: malzemeAlt.ad,
        kategori: malzemeAlt.mal_kategori,
        birim: malzemeAlt.birim,
        miktar,
        min_miktar: parseFloat(malzemeAlt.min_miktar) || 0,
        birim_fiyat: birimFiyat,
        faturali: malzemeAlt.faturali,
        nakliye_tutari: nakliye,
        alis_tarihi: form.tarih,
        kullanici_id: user!.id,
        kaynak_islem_id: islemId,
      }

      if (linkedMalzemeId) {
        await supabase.from("malzemeler").update({
          ...malzemePayload, updated_at: new Date().toISOString()
        }).eq("id", linkedMalzemeId)
      } else {
        await supabase.from("malzemeler").insert(malzemePayload)
      }
    }

    // ── Diğer türler: çoklu islem_stok satırları ──────────────────────────
    if (!isMalzemeGider && stokEkle && stokSatirlar.length > 0) {
      const gecerli = stokSatirlar.filter(s => s.malzeme_id && parseFloat(s.miktar) > 0)
      if (gecerli.length > 0) {
        const stokTur = form.tur === "gider" ? "giris" : "cikis"
        await supabase.from("islem_stok").insert(
          gecerli.map(s => ({
            islem_id: islemId,
            malzeme_id: s.malzeme_id,
            miktar: parseFloat(s.miktar),
            tur: stokTur,
            birim_fiyat: parseFloat(s.birim_fiyat || "0"),
          }))
        )
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  const stokLabel = "Stoktan çıkış (mal kullanımı / satış)"

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "İşlemi Düzenle" : "Yeni İşlem"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">

          {/* Temel bilgiler */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tür</Label>
              <Select value={form.tur} onValueChange={v => setF("tur", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gelir">Gelir</SelectItem>
                  <SelectItem value="gider">Gider</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kategori</Label>
              <Select value={form.kategori} onValueChange={v => setF("kategori", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Açıklama</Label>
            <Input value={form.aciklama} onChange={e => setF("aciklama", e.target.value)} placeholder="İşlem açıklaması" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Toplam Tutar (₺)</Label>
              <Input type="number" min="0" step="0.01" value={form.tutar} onChange={e => setF("tutar", e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Tarih</Label>
              <Input type="date" value={form.tarih} onChange={e => setF("tarih", e.target.value)} />
            </div>
          </div>

          {/* Ödeme durumu */}
          <div className="space-y-3 border border-border rounded-lg p-3">
            <p className="text-sm font-medium">Ödeme Durumu</p>
            <Select value={form.odeme_durumu} onValueChange={v => setF("odeme_durumu", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="odendi">✅ Ödendi (tam)</SelectItem>
                <SelectItem value="kismi_odendi">🔶 Kısmi Ödendi</SelectItem>
                <SelectItem value="beklemede">⏳ Beklemede / Vadeli</SelectItem>
              </SelectContent>
            </Select>
            {form.odeme_durumu === "kismi_odendi" && (
              <div className="space-y-1.5">
                <Label>Ödenen Miktar (₺)</Label>
                <Input type="number" min="0" step="0.01" value={form.ilk_odeme} onChange={e => setF("ilk_odeme", e.target.value)} placeholder="0.00" />
              </div>
            )}
            {form.odeme_durumu !== "odendi" && (
              <div className="space-y-1.5">
                <Label>Vade Tarihi</Label>
                <Input type="date" value={form.vade_tarihi} onChange={e => setF("vade_tarihi", e.target.value)} />
              </div>
            )}
          </div>

          {/* ── Malzeme Gider: Stok alanları doğrudan formun içinde ──────── */}
          {isMalzemeGider && (<>
            <div className="relative flex items-center gap-2 py-1">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground shrink-0">Stok Bilgisi</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <div className="space-y-1.5">
              <Label>Malzeme Adı *</Label>
              <Input
                value={malzemeAlt.ad}
                onChange={e => setMA("ad", e.target.value)}
                placeholder="Malzeme adı"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Stok Kategorisi</Label>
                <Select value={malzemeAlt.mal_kategori} onValueChange={v => setMA("mal_kategori", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MALZEME_KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Birim</Label>
                <Select value={malzemeAlt.birim} onValueChange={v => setMA("birim", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BIRIMLER.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Miktar *</Label>
                <Input
                  type="number" min="0" step="0.001"
                  value={malzemeAlt.miktar}
                  onChange={e => setMA("miktar", e.target.value)}
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Min. Stok</Label>
                <Input
                  type="number" min="0"
                  value={malzemeAlt.min_miktar}
                  onChange={e => setMA("min_miktar", e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Nakliye Tutarı (₺) — isteğe bağlı</Label>
              <Input
                type="number" min="0" step="0.01"
                value={malzemeAlt.nakliye_tutari}
                onChange={e => setMA("nakliye_tutari", e.target.value)}
                placeholder="0.00"
              />
            </div>

            {hesapBirimFiyat !== null && (
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Birim fiyat (hesap)</span>
                <span className="font-medium">{formatCurrency(hesapBirimFiyat)} / {malzemeAlt.birim}</span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="faturali_alt"
                checked={malzemeAlt.faturali}
                onChange={e => setMA("faturali", e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <label htmlFor="faturali_alt" className="text-sm font-medium cursor-pointer">Faturalı</label>
            </div>

            <div className="relative flex items-center gap-2 py-1">
              <div className="flex-1 border-t border-border" />
            </div>
          </>)}

          {/* ── Diğer türler: islem_stok çoklu satır ─────────────────────── */}
          {!isMalzemeGider && (
            <div className="space-y-3 border border-border rounded-lg p-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="stok_ekle"
                  checked={stokEkle}
                  onChange={e => {
                    setStokEkle(e.target.checked)
                    if (e.target.checked && stokSatirlar.length === 0) addStokSatir()
                    if (!e.target.checked) setStokSatirlar([])
                  }}
                  className="h-4 w-4 rounded border-border"
                />
                <label htmlFor="stok_ekle" className="text-sm font-medium cursor-pointer">{stokLabel}</label>
              </div>
              {stokEkle && (
                <div className="space-y-2">
                  {stokSatirlar.map((satir, i) => {
                    const secili = malzemeler.find(m => m.id === satir.malzeme_id)
                    return (
                      <div key={i} className="grid grid-cols-[1fr_80px_80px_32px] gap-2 items-end">
                        <div className="space-y-1">
                          {i === 0 && <Label className="text-xs">Malzeme</Label>}
                          <Select value={satir.malzeme_id} onValueChange={v => onMalzemeSelect(i, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seçin..." /></SelectTrigger>
                            <SelectContent>
                              {malzemeler.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.ad} ({m.miktar} {m.birim})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          {i === 0 && <Label className="text-xs">Miktar{secili ? ` (${secili.birim})` : ""}</Label>}
                          <Input className="h-8 text-xs" type="number" min="0" step="0.001" value={satir.miktar} onChange={e => updateStokSatir(i, "miktar", e.target.value)} placeholder="0" />
                        </div>
                        <div className="space-y-1">
                          {i === 0 && <Label className="text-xs">Birim Fiyat</Label>}
                          <Input className="h-8 text-xs" type="number" min="0" step="0.01" value={satir.birim_fiyat} onChange={e => updateStokSatir(i, "birim_fiyat", e.target.value)} placeholder="0.00" />
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeStokSatir(i)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )
                  })}
                  <Button variant="outline" size="sm" onClick={addStokSatir} className="gap-1 text-xs">
                    <Plus className="h-3 w-3" /> Satır Ekle
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Emek */}
          <div className="space-y-1.5">
            <Label>Emek — Adam/Saat (isteğe bağlı)</Label>
            <Input
              type="number" min="0" step="0.5"
              value={form.adam_saat}
              onChange={e => setF("adam_saat", e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Notlar */}
          <div className="space-y-1.5">
            <Label>Notlar (isteğe bağlı)</Label>
            <Input value={form.notlar} onChange={e => setF("notlar", e.target.value)} placeholder="Ek notlar..." />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Kaydet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
