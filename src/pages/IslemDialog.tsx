import { useEffect, useState, useMemo } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { supabase, type Islem, type MalzemeWithFiyat, type Hesap, type AppUser } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

const KATEGORILER = ["Satış", "Hizmet", "Kira", "Maaş", "Malzeme", "Demirbaş", "Fatura", "Vergi", "Noter", "Harç", "Muhasebe", "Gıda", "Sigorta", "Akaryakıt", "Diğer"]
const MALZEME_KATEGORILER = ["Hammadde", "Yarı Mamul", "Mamul", "Sarf Malzeme", "Ekipman", "Diğer"]
const DEMIRBAŞ_KATEGORILER = ["Bilgisayar", "Mobilya", "Araç", "Ekipman", "Yazılım", "Diğer"]
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
}

const defaultMalzemeAlt: MalzemeAlt = {
  ad: "",
  mal_kategori: "Hammadde",
  birim: "Adet",
  miktar: "",
  min_miktar: "0",
}

interface DemirbasAlt {
  ad: string
  db_kategori: string
  marka: string
  model: string
  seri_no: string
  konum: string
  garanti_bitis: string
  zimmet_kullanici_id: string
  zimmet_tarihi: string
}

const defaultDemirbasAlt: DemirbasAlt = {
  ad: "",
  db_kategori: "Bilgisayar",
  marka: "",
  model: "",
  seri_no: "",
  konum: "",
  garanti_bitis: "",
  zimmet_kullanici_id: "",
  zimmet_tarihi: "",
}

interface Props {
  open: boolean
  onClose: () => void
  editing: Islem | null
  initialValues?: Islem
  malzemeler: MalzemeWithFiyat[]
  hesaplar: Hesap[]
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
  nakliye_tutari: "",
  faturali: true,
  hesap_id: "",
}

export function IslemDialog({ open, onClose, editing, initialValues, malzemeler, hesaplar, onSaved }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState(defaultForm)
  const [stokSatirlar, setStokSatirlar] = useState<StokSatir[]>([])
  const [stokEkle, setStokEkle] = useState(false)
  const [malzemeAlt, setMalzemeAlt] = useState<MalzemeAlt>(defaultMalzemeAlt)
  const [linkedMalzemeId, setLinkedMalzemeId] = useState<string | null>(null)
  const [demirbasAlt, setDemirbasAlt] = useState<DemirbasAlt>(defaultDemirbasAlt)
  const [linkedDemirbasId, setLinkedDemirbasId] = useState<string | null>(null)
  const [kullanicilar, setKullanicilar] = useState<AppUser[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMalzemeGider = form.tur === "gider" && form.kategori === "Malzeme"
  const isDemirbasGider = form.tur === "gider" && form.kategori === "Demirbaş"

  // Hesaplanan birim fiyat = (tutar - nakliye) / miktar
  const hesapBirimFiyat = useMemo(() => {
    const tutar = parseFloat(form.tutar) || 0
    const miktar = parseFloat(malzemeAlt.miktar) || 0
    const nakliye = parseFloat(form.nakliye_tutari) || 0
    if (miktar <= 0 || tutar <= 0) return null
    return (tutar - nakliye) / miktar
  }, [form.tutar, form.nakliye_tutari, malzemeAlt.miktar])

  useEffect(() => {
    if (kullanicilar.length === 0) {
      supabase.from("kullanicilar").select("*").eq("aktif", true).order("ad_soyad")
        .then(({ data }) => setKullanicilar((data ?? []) as AppUser[]))
    }
  }, [])

  useEffect(() => {
    if (!isDemirbasGider || !form.tarih) return
    const garantiOtomatik = (() => {
      const d = new Date(form.tarih)
      d.setFullYear(d.getFullYear() + 2)
      return d.toISOString().slice(0, 10)
    })()
    setDemirbasAlt(prev => ({
      ...prev,
      zimmet_tarihi: prev.zimmet_tarihi || form.tarih,
      garanti_bitis: prev.garanti_bitis || garantiOtomatik,
    }))
  }, [form.tarih, isDemirbasGider])

  useEffect(() => {
    if (!open) return
    setError(null)
    setLinkedMalzemeId(null)
    setMalzemeAlt(defaultMalzemeAlt)
    setLinkedDemirbasId(null)
    setDemirbasAlt(defaultDemirbasAlt)

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
        nakliye_tutari: editing.nakliye_tutari != null ? String(editing.nakliye_tutari) : "",
        faturali: editing.faturali ?? true,
        hesap_id: editing.hesap_id ?? "",
      })

      if (editing.tur === "gider" && editing.kategori === "Malzeme") {
        supabase.from("malzemeler").select("*").eq("kaynak_islem_id", editing.id).maybeSingle()
          .then(({ data }) => {
            if (data) {
              setLinkedMalzemeId(data.id)
              setMalzemeAlt({ ad: data.ad, mal_kategori: data.kategori, birim: data.birim, miktar: String(data.miktar), min_miktar: String(data.min_miktar) })
            }
          })
      } else if (editing.tur === "gider" && editing.kategori === "Demirbaş") {
        supabase.from("demirbaslar").select("*").eq("kaynak_islem_id", editing.id).maybeSingle()
          .then(({ data }) => {
            if (data) {
              setLinkedDemirbasId(data.id)
              setDemirbasAlt({ ad: data.ad, db_kategori: data.kategori, marka: data.marka ?? "", model: data.model ?? "", seri_no: data.seri_no ?? "", konum: data.konum ?? "", garanti_bitis: data.garanti_bitis ?? "", zimmet_kullanici_id: data.zimmet_kullanici_id ?? "", zimmet_tarihi: data.zimmet_tarihi ?? "" })
            }
          })
      } else {
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
    } else if (initialValues) {
      setForm({
        tarih: new Date().toISOString().slice(0, 10),
        aciklama: initialValues.aciklama,
        tutar: String(initialValues.tutar),
        tur: initialValues.tur,
        kategori: initialValues.kategori,
        odeme_durumu: "odendi",
        ilk_odeme: "",
        vade_tarihi: "",
        notlar: initialValues.notlar ?? "",
        adam_saat: initialValues.adam_saat != null ? String(initialValues.adam_saat) : "",
        nakliye_tutari: initialValues.nakliye_tutari != null ? String(initialValues.nakliye_tutari) : "",
        faturali: initialValues.faturali ?? true,
        hesap_id: initialValues.hesap_id ?? "",
      })
      // linkedId'ler boş kalır — kopyada yeni sub-record oluşturulacak
      if (initialValues.tur === "gider" && initialValues.kategori === "Malzeme") {
        supabase.from("malzemeler").select("*").eq("kaynak_islem_id", initialValues.id).maybeSingle()
          .then(({ data }) => {
            if (data) setMalzemeAlt({ ad: data.ad, mal_kategori: data.kategori, birim: data.birim, miktar: String(data.miktar), min_miktar: String(data.min_miktar) })
          })
      } else if (initialValues.tur === "gider" && initialValues.kategori === "Demirbaş") {
        supabase.from("demirbaslar").select("*").eq("kaynak_islem_id", initialValues.id).maybeSingle()
          .then(({ data }) => {
            if (data) setDemirbasAlt({ ad: data.ad, db_kategori: data.kategori, marka: data.marka ?? "", model: data.model ?? "", seri_no: data.seri_no ?? "", konum: data.konum ?? "", garanti_bitis: data.garanti_bitis ?? "", zimmet_kullanici_id: data.zimmet_kullanici_id ?? "", zimmet_tarihi: data.zimmet_tarihi ?? "" })
          })
      } else if (initialValues.tur === "gelir") {
        supabase.from("islem_stok").select("*").eq("islem_id", initialValues.id).then(({ data }) => {
          if (data && data.length > 0) {
            setStokEkle(true)
            setStokSatirlar(data.map(s => ({ malzeme_id: s.malzeme_id, miktar: String(s.miktar), birim_fiyat: String(s.birim_fiyat) })))
          }
        })
      }
    } else {
      setForm(defaultForm)
      setStokEkle(false)
      setStokSatirlar([])
    }
  }, [open, editing, initialValues])

  function setF(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function setMA(field: keyof MalzemeAlt, value: string) {
    setMalzemeAlt(prev => ({ ...prev, [field]: value }))
    if (field === "ad") {
      setForm(prev => ({ ...prev, aciklama: value ? `${value} alım` : "" }))
    }
  }

  function setDA(field: keyof DemirbasAlt, value: string) {
    setDemirbasAlt(prev => ({ ...prev, [field]: value }))
    if (field === "ad") {
      setForm(prev => ({ ...prev, aciklama: value ? `${value} alım` : "" }))
    }
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
    const birimMaliyet = m?.kaynak_islem && m.miktar > 0
      ? (m.kaynak_islem.tutar - (m.kaynak_islem.nakliye_tutari ?? 0)) / m.miktar
      : 0
    setStokSatirlar(prev => prev.map((s, idx) =>
      idx === i ? { ...s, malzeme_id: malzemeId, birim_fiyat: String(birimMaliyet) } : s
    ))
  }

  async function handleSave() {
    if (!form.aciklama || !form.tutar || !form.tarih) return
    if (isMalzemeGider && (!malzemeAlt.ad || !malzemeAlt.miktar)) {
      setError("Stok bilgisi için malzeme adı ve miktar zorunludur.")
      return
    }
    if (isDemirbasGider && !demirbasAlt.ad) {
      setError("Demirbaş adı zorunludur.")
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
      nakliye_tutari: form.nakliye_tutari ? parseFloat(form.nakliye_tutari) : null,
      faturali: form.faturali,
      hesap_id: form.hesap_id || null,
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

    // ── Demirbaş gider: demirbaş kaydı oluştur / güncelle ────────────────
    if (isDemirbasGider) {
      const demirbasPayload = {
        ad: demirbasAlt.ad,
        kategori: demirbasAlt.db_kategori,
        marka: demirbasAlt.marka || null,
        model: demirbasAlt.model || null,
        seri_no: demirbasAlt.seri_no || null,
        konum: demirbasAlt.konum || null,
        garanti_bitis: demirbasAlt.garanti_bitis || null,
        zimmet_kullanici_id: demirbasAlt.zimmet_kullanici_id || null,
        zimmet_tarihi: demirbasAlt.zimmet_tarihi || null,
        alis_fiyati: toplam,
        alis_tarihi: form.tarih,
        durum: "aktif" as const,
        kaynak_islem_id: islemId,
        updated_at: new Date().toISOString(),
      }
      if (linkedDemirbasId) {
        const { error: dbErr } = await supabase.from("demirbaslar").update(demirbasPayload).eq("id", linkedDemirbasId)
        if (dbErr) { setError(dbErr.message); setSaving(false); return }
      } else {
        const { error: dbErr } = await supabase.from("demirbaslar").insert(demirbasPayload)
        if (dbErr) { setError(dbErr.message); setSaving(false); return }
      }
    }

    // ── Malzeme gider: stok kaydı oluştur / güncelle ──────────────────────
    if (isMalzemeGider) {
      const miktar = parseFloat(malzemeAlt.miktar) || 0
      const malzemePayload = {
        ad: malzemeAlt.ad,
        kategori: malzemeAlt.mal_kategori,
        birim: malzemeAlt.birim,
        miktar,
        min_miktar: parseFloat(malzemeAlt.min_miktar) || 0,
        aciklama: "",
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

    // ── Gelir: stoktan çıkış ───────────────────────────────────────────────
    if (form.tur === "gelir" && stokEkle && stokSatirlar.length > 0) {
      const gecerli = stokSatirlar.filter(s => s.malzeme_id && parseFloat(s.miktar) > 0)
      if (gecerli.length > 0) {
        await supabase.from("islem_stok").insert(
          gecerli.map(s => ({
            islem_id: islemId,
            malzeme_id: s.malzeme_id,
            miktar: parseFloat(s.miktar),
            tur: "cikis",
            birim_fiyat: parseFloat(s.birim_fiyat || "0"),
          }))
        )
      }
    }

    setSaving(false)
    onSaved()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "İşlemi Düzenle" : initialValues ? "İşlemi Kopyala" : "Yeni İşlem"}</DialogTitle>
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

          {hesaplar.length > 0 && (
            <div className="space-y-1.5">
              <Label>Hesap (isteğe bağlı)</Label>
              <Select value={form.hesap_id || "__none__"} onValueChange={v => setF("hesap_id", v === "__none__" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Hesap seçin..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Hesap seçilmedi —</SelectItem>
                  {hesaplar.filter(h => h.aktif).map(h => (
                    <SelectItem key={h.id} value={h.id}>{h.ad}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Açıklama</Label>
            <Input
              value={form.aciklama}
              onChange={e => setF("aciklama", e.target.value)}
              placeholder="İşlem açıklaması"
              disabled={isMalzemeGider || isDemirbasGider}
            />
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

          {/* Nakliye — yalnızca Malzeme gider */}
          {isMalzemeGider && (
            <div className="space-y-1.5">
              <Label>Nakliye Tutarı (₺) — isteğe bağlı</Label>
              <Input
                type="number" min="0" step="0.01"
                value={form.nakliye_tutari}
                onChange={e => setF("nakliye_tutari", e.target.value)}
                placeholder="0.00"
              />
            </div>
          )}

          {/* Faturalı */}
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

          {/* ── Malzeme Gider: Stok alanları ────────────────────────────── */}
          {isMalzemeGider && (<>
            <div className="relative flex items-center gap-2 py-1">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground shrink-0">Stok Bilgisi</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <div className="space-y-1.5">
              <Label>Malzeme Adı *</Label>
              <Input value={malzemeAlt.ad} onChange={e => setMA("ad", e.target.value)} placeholder="Malzeme adı" />
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
                <Input type="number" min="0" step="0.001" value={malzemeAlt.miktar} onChange={e => setMA("miktar", e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Min. Stok</Label>
                <Input type="number" min="0" value={malzemeAlt.min_miktar} onChange={e => setMA("min_miktar", e.target.value)} placeholder="0" />
              </div>
            </div>

            {hesapBirimFiyat !== null && (
              <div className="flex items-center justify-between rounded-md bg-muted px-3 py-2 text-sm">
                <span className="text-muted-foreground">Birim fiyat (hesap)</span>
                <span className="font-medium">{formatCurrency(hesapBirimFiyat)} / {malzemeAlt.birim}</span>
              </div>
            )}

            <div className="relative flex items-center py-1">
              <div className="flex-1 border-t border-border" />
            </div>
          </>)}

          {/* ── Demirbaş Gider ─────────────────────────────────────────── */}
          {isDemirbasGider && (<>
            <div className="relative flex items-center gap-2 py-1">
              <div className="flex-1 border-t border-border" />
              <span className="text-xs text-muted-foreground shrink-0">Demirbaş Bilgisi</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <div className="space-y-1.5">
              <Label>Demirbaş Adı *</Label>
              <Input value={demirbasAlt.ad} onChange={e => setDA("ad", e.target.value)} placeholder="ör. MacBook Pro 14, Çalışma Masası" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Kategori</Label>
                <Select value={demirbasAlt.db_kategori} onValueChange={v => setDA("db_kategori", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DEMIRBAŞ_KATEGORILER.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Marka</Label>
                <Input value={demirbasAlt.marka} onChange={e => setDA("marka", e.target.value)} placeholder="Apple, IKEA..." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Model</Label>
                <Input value={demirbasAlt.model} onChange={e => setDA("model", e.target.value)} placeholder="Model adı" />
              </div>
              <div className="space-y-1.5">
                <Label>Seri No</Label>
                <Input value={demirbasAlt.seri_no} onChange={e => setDA("seri_no", e.target.value)} placeholder="S/N..." />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Konum</Label>
                <Input value={demirbasAlt.konum} onChange={e => setDA("konum", e.target.value)} placeholder="Ofis / Depo" />
              </div>
              <div className="space-y-1.5">
                <Label>Garanti Bitiş</Label>
                <Input type="date" value={demirbasAlt.garanti_bitis} onChange={e => setDA("garanti_bitis", e.target.value)} />
              </div>
            </div>

            <div className="space-y-3 border border-border rounded-lg p-3">
              <p className="text-xs font-medium text-muted-foreground">Zimmet (isteğe bağlı)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Zimmetli Kişi</Label>
                  <Select
                    value={demirbasAlt.zimmet_kullanici_id || "bos"}
                    onValueChange={v => setDA("zimmet_kullanici_id", v === "bos" ? "" : v)}
                  >
                    <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bos">— Zimmet yok —</SelectItem>
                      {kullanicilar.map(k => <SelectItem key={k.id} value={k.id}>{k.ad_soyad}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Zimmet Tarihi</Label>
                  <Input type="date" value={demirbasAlt.zimmet_tarihi} onChange={e => setDA("zimmet_tarihi", e.target.value)} />
                </div>
              </div>
            </div>

            <div className="relative flex items-center py-1">
              <div className="flex-1 border-t border-border" />
            </div>
          </>)}

          {/* ── Gelir: stoktan çıkış ────────────────────────────────────── */}
          {form.tur === "gelir" && (
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
                <label htmlFor="stok_ekle" className="text-sm font-medium cursor-pointer">Stoktan çıkış (mal kullanımı / satış)</label>
              </div>
              {stokEkle && (
                <div className="space-y-2">
                  {stokSatirlar.map((satir, i) => {
                    const secili = malzemeler.find(m => m.id === satir.malzeme_id)
                    return (
                      <div key={i} className="grid grid-cols-[1fr_80px_32px] gap-2 items-end">
                        <div className="space-y-1">
                          {i === 0 && <Label className="text-xs">Malzeme</Label>}
                          <Select value={satir.malzeme_id} onValueChange={v => onMalzemeSelect(i, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seçin..." /></SelectTrigger>
                            <SelectContent>
                              {malzemeler.filter(m => m.miktar > 0 || m.id === satir.malzeme_id).map(m => {
                                const birimFiyat = m.kaynak_islem && m.miktar > 0
                                  ? (m.kaynak_islem.tutar - (m.kaynak_islem.nakliye_tutari ?? 0)) / m.miktar
                                  : null
                                return (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.ad} · {m.miktar} {m.birim}
                                    {birimFiyat !== null ? ` · ${formatCurrency(birimFiyat)}/${m.birim}` : ""}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          {i === 0 && <Label className="text-xs">Miktar{secili ? ` (${secili.birim})` : ""}</Label>}
                          <Input className="h-8 text-xs" type="number" min="0" step="0.001" value={satir.miktar} onChange={e => updateStokSatir(i, "miktar", e.target.value)} placeholder="0" />
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
            <Input type="number" min="0" step="0.5" value={form.adam_saat} onChange={e => setF("adam_saat", e.target.value)} placeholder="0" />
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
