import { useEffect, useState, useMemo } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { supabase, type Islem, type MalzemeWithStok, type Hesap, type AppUser } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"

const KATEGORILER = ["Satış", "Hizmet", "Kira", "Maaş", "Malzeme", "Demirbaş", "Fatura", "Vergi", "Noter", "Harç", "Muhasebe", "Gıda", "Sigorta", "Akaryakıt", "Diğer"]
const MALZEME_KATEGORILER = ["Hammadde", "Yarı Mamul", "Mamul", "Sarf Malzeme", "Ekipman", "Diğer"]
const DEMIRBAŞ_KATEGORILER = ["Bilgisayar", "Mobilya", "Araç", "Ekipman", "Yazılım", "Diğer"]
const BIRIMLER = ["Adet", "Kg", "Lt", "m", "m²", "m³", "Paket", "Kutu", "Ton"]

interface StokSatir {
  malzeme_id: string
  miktar: string
  birim_fiyat: string
}

interface OdemeSatir {
  id?: string
  tarih: string
  tutar: string
  hesap_id: string
  aciklama: string
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
  malzemeler: MalzemeWithStok[]
  hesaplar: Hesap[]
  gelirIslemleri: Islem[]
  onSaved: () => void
}

const defaultForm = {
  tarih: new Date().toISOString().slice(0, 10),
  aciklama: "",
  tutar: "",
  tur: "gelir" as "gelir" | "gider",
  kategori: "Diğer",
  vade_tarihi: "",
  notlar: "",
  adam_saat: "",
  nakliye_tutari: "",
  nakliye_faturali: false,
  faturali: false,
  bagli_gelir_islem_id: "",
}

export function IslemDialog({ open, onClose, editing, initialValues, malzemeler, hesaplar, gelirIslemleri, onSaved }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState(defaultForm)
  const [stokSatirlar, setStokSatirlar] = useState<StokSatir[]>([])
  const [stokEkle, setStokEkle] = useState(false)
  const [odemeSatirlar, setOdemeSatirlar] = useState<OdemeSatir[]>([])
  const [malzemeAlt, setMalzemeAlt] = useState<MalzemeAlt>(defaultMalzemeAlt)
  const [linkedMalzemeId, setLinkedMalzemeId] = useState<string | null>(null)
  const [demirbasAlt, setDemirbasAlt] = useState<DemirbasAlt>(defaultDemirbasAlt)
  const [linkedDemirbasId, setLinkedDemirbasId] = useState<string | null>(null)
  const [kullanicilar, setKullanicilar] = useState<AppUser[]>([])
  const [bagliGiderler, setBagliGiderler] = useState<Islem[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMalzemeGider = form.tur === "gider" && form.kategori === "Malzeme"
  const isDemirbasGider = form.tur === "gider" && form.kategori === "Demirbaş"
  const isHizmetGider = form.tur === "gider" && form.kategori === "Hizmet"

  const hesapBirimFiyat = useMemo(() => {
    const tutar = parseFloat(form.tutar) || 0
    const nakliye = parseFloat(form.nakliye_tutari) || 0
    const miktar = parseFloat(malzemeAlt.miktar) || 0
    if (miktar <= 0 || tutar <= 0) return null
    return (tutar + nakliye) / miktar
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
    setOdemeSatirlar([])
    setBagliGiderler([])

    if (editing) {
      setForm({
        tarih: editing.tarih,
        aciklama: editing.aciklama,
        tutar: String(editing.tutar),
        tur: editing.tur,
        kategori: editing.kategori,
        vade_tarihi: editing.vade_tarihi ?? "",
        notlar: editing.notlar ?? "",
        adam_saat: editing.adam_saat != null ? String(editing.adam_saat) : "",
        nakliye_tutari: editing.nakliye_tutari != null ? String(editing.nakliye_tutari) : "",
        nakliye_faturali: editing.nakliye_faturali ?? false,
        faturali: editing.faturali ?? false,
        bagli_gelir_islem_id: editing.bagli_gelir_islem_id ?? "",
      })

      // Mevcut ödemeleri yükle
      supabase.from("odemeler").select("*").eq("islem_id", editing.id).order("tarih")
        .then(({ data }) => {
          if (data && data.length > 0) {
            setOdemeSatirlar(data.map(o => ({
              id: o.id,
              tarih: o.tarih,
              tutar: String(o.tutar),
              hesap_id: o.hesap_id ?? "",
              aciklama: o.aciklama ?? "",
            })))
          }
        })

      if (editing.tur === "gider" && editing.kategori === "Malzeme") {
        supabase.from("islem_stok")
          .select("malzeme_id, miktar")
          .eq("islem_id", editing.id)
          .eq("tur", "giris")
          .maybeSingle()
          .then(async ({ data: giris }) => {
            if (!giris) return
            setLinkedMalzemeId(giris.malzeme_id)
            const { data: m } = await supabase.from("malzemeler").select("*").eq("id", giris.malzeme_id).maybeSingle()
            if (m) setMalzemeAlt({ ad: m.ad, mal_kategori: m.kategori, birim: m.birim, miktar: String(giris.miktar), min_miktar: String(m.min_miktar) })
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
        supabase.from("islem_stok").select("*").eq("islem_id", editing.id).eq("tur", "cikis").then(({ data }) => {
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
        // Gelir ise bağlı giderleri yükle
        if (editing.tur === "gelir") {
          supabase.from("islemler")
            .select("*")
            .eq("bagli_gelir_islem_id", editing.id)
            .order("tarih")
            .then(({ data }) => setBagliGiderler((data ?? []) as Islem[]))
        }
      }
    } else if (initialValues) {
      setForm({
        tarih: new Date().toISOString().slice(0, 10),
        aciklama: initialValues.aciklama,
        tutar: String(initialValues.tutar),
        tur: initialValues.tur,
        kategori: initialValues.kategori,
        vade_tarihi: "",
        notlar: initialValues.notlar ?? "",
        adam_saat: initialValues.adam_saat != null ? String(initialValues.adam_saat) : "",
        nakliye_tutari: initialValues.nakliye_tutari != null ? String(initialValues.nakliye_tutari) : "",
        nakliye_faturali: initialValues.nakliye_faturali ?? false,
        faturali: initialValues.faturali ?? false,
        bagli_gelir_islem_id: "",
      })
      // Kopyada ödemeler sıfır başlar — linkedId'ler boş kalır
      if (initialValues.tur === "gider" && initialValues.kategori === "Malzeme") {
        supabase.from("islem_stok")
          .select("malzeme_id, miktar")
          .eq("islem_id", initialValues.id)
          .eq("tur", "giris")
          .maybeSingle()
          .then(async ({ data: giris }) => {
            if (!giris) return
            const { data: m } = await supabase.from("malzemeler").select("*").eq("id", giris.malzeme_id).maybeSingle()
            if (m) setMalzemeAlt({ ad: m.ad, mal_kategori: m.kategori, birim: m.birim, miktar: String(giris.miktar), min_miktar: String(m.min_miktar) })
          })
      } else if (initialValues.tur === "gider" && initialValues.kategori === "Demirbaş") {
        supabase.from("demirbaslar").select("*").eq("kaynak_islem_id", initialValues.id).maybeSingle()
          .then(({ data }) => {
            if (data) setDemirbasAlt({ ad: data.ad, db_kategori: data.kategori, marka: data.marka ?? "", model: data.model ?? "", seri_no: data.seri_no ?? "", konum: data.konum ?? "", garanti_bitis: data.garanti_bitis ?? "", zimmet_kullanici_id: data.zimmet_kullanici_id ?? "", zimmet_tarihi: data.zimmet_tarihi ?? "" })
          })
      } else if (initialValues.tur === "gelir") {
        supabase.from("islem_stok").select("*").eq("islem_id", initialValues.id).eq("tur", "cikis").then(({ data }) => {
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
    const birimFiyat = m?.son_birim_fiyat ?? 0
    setStokSatirlar(prev => prev.map((s, idx) =>
      idx === i ? { ...s, malzeme_id: malzemeId, birim_fiyat: String(birimFiyat) } : s
    ))
  }

  function addOdeme() {
    setOdemeSatirlar(prev => {
      const toplam = (parseFloat(form.tutar) || 0) + (parseFloat(form.nakliye_tutari) || 0)
      const odenen = prev.reduce((s, o) => s + (parseFloat(o.tutar) || 0), 0)
      const kalan = Math.max(0, toplam - odenen)
      return [...prev, {
        tarih: form.tarih,
        tutar: kalan > 0 ? String(kalan) : "",
        hesap_id: "",
        aciklama: "",
      }]
    })
  }

  function removeOdeme(i: number) {
    setOdemeSatirlar(prev => prev.filter((_, idx) => idx !== i))
  }

  function updateOdeme(i: number, field: keyof OdemeSatir, value: string) {
    setOdemeSatirlar(prev => prev.map((o, idx) => idx === i ? { ...o, [field]: value } : o))
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
    const gecerliOdemeler = odemeSatirlar.filter(o => parseFloat(o.tutar) > 0)

    const islemPayload = {
      tarih: form.tarih,
      aciklama: form.aciklama,
      tutar: toplam,
      tur: form.tur,
      kategori: form.kategori,
      vade_tarihi: form.vade_tarihi || null,
      notlar: form.notlar || null,
      adam_saat: form.adam_saat ? parseFloat(form.adam_saat) : null,
      nakliye_tutari: form.nakliye_tutari ? parseFloat(form.nakliye_tutari) : null,
      nakliye_faturali: form.nakliye_faturali,
      faturali: form.faturali,
      bagli_gelir_islem_id: (isHizmetGider && form.bagli_gelir_islem_id) ? form.bagli_gelir_islem_id : null,
      kullanici_id: user!.id,
    }

    let islemId: string

    if (editing) {
      const { error } = await supabase.from("islemler").update(islemPayload).eq("id", editing.id)
      if (error) { setError(error.message); setSaving(false); return }
      islemId = editing.id
      await supabase.from("odemeler").delete().eq("islem_id", islemId)
      await supabase.from("islem_stok").delete().eq("islem_id", islemId)
      // Kategori Malzeme'den başka bir türe değiştiyse bağlı malzeme kaydını sil
      if (linkedMalzemeId && !isMalzemeGider) {
        await supabase.from("malzemeler").delete().eq("id", linkedMalzemeId)
      }
    } else {
      const { data, error } = await supabase.from("islemler").insert(islemPayload).select().single()
      if (error) { setError(error.message); setSaving(false); return }
      islemId = data.id
    }

    // Ödeme satırlarını kaydet
    if (gecerliOdemeler.length > 0) {
      await supabase.from("odemeler").insert(
        gecerliOdemeler.map(o => ({
          islem_id: islemId,
          tarih: o.tarih,
          tutar: parseFloat(o.tutar),
          hesap_id: o.hesap_id || null,
          aciklama: o.aciklama || null,
          kullanici_id: user!.id,
        }))
      )
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

    // ── Malzeme gider: malzeme kaydı + giris stok hareketi ───────────────
    if (isMalzemeGider) {
      const miktar = parseFloat(malzemeAlt.miktar) || 0
      const nakliye = parseFloat(form.nakliye_tutari) || 0
      const birimFiyat = miktar > 0 ? (toplam + nakliye) / miktar : 0
      const malzemePayload = {
        ad: malzemeAlt.ad,
        kategori: malzemeAlt.mal_kategori,
        birim: malzemeAlt.birim,
        min_miktar: parseFloat(malzemeAlt.min_miktar) || 0,
        aciklama: "",
        kullanici_id: user!.id,
      }

      let malzemeId = linkedMalzemeId
      if (malzemeId) {
        await supabase.from("malzemeler").update({ ...malzemePayload, updated_at: new Date().toISOString() }).eq("id", malzemeId)
      } else {
        const { data: newM } = await supabase.from("malzemeler").insert(malzemePayload).select("id").single()
        malzemeId = newM?.id ?? null
      }

      if (malzemeId) {
        await supabase.from("islem_stok").insert({
          islem_id: islemId,
          malzeme_id: malzemeId,
          miktar,
          tur: "giris",
          birim_fiyat: birimFiyat,
        })
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
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label>Nakliye Tutarı (₺) — isteğe bağlı</Label>
                <Input
                  type="number" min="0" step="0.01"
                  value={form.nakliye_tutari}
                  onChange={e => setF("nakliye_tutari", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              {form.nakliye_tutari && parseFloat(form.nakliye_tutari) > 0 && (
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="nakliye_faturali"
                    checked={form.nakliye_faturali}
                    onChange={e => setForm(p => ({ ...p, nakliye_faturali: e.target.checked }))}
                    className="h-4 w-4 rounded border-border"
                  />
                  <label htmlFor="nakliye_faturali" className="text-sm font-medium cursor-pointer">Nakliye Faturalı</label>
                </div>
              )}
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

          {/* ── Ödemeler ───────────────────────────────────────────────── */}
          <div className="space-y-2 border border-border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Ödemeler</p>
              <Button variant="outline" size="sm" onClick={addOdeme} className="gap-1 text-xs h-7">
                <Plus className="h-3 w-3" /> Ödeme Ekle
              </Button>
            </div>
            {odemeSatirlar.length === 0 ? (
              <p className="text-xs text-muted-foreground py-1">Henüz ödeme eklenmedi — beklemede olarak kaydedilecek</p>
            ) : (
              <div className="space-y-2">
                {odemeSatirlar.map((odeme, i) => (
                  <div key={i} className="border border-border/60 rounded-md p-2 space-y-2 bg-muted/20">
                    <div className="flex gap-2 items-center">
                      <Input
                        className="h-8 text-xs w-24"
                        type="number" min="0" step="0.01"
                        placeholder="Tutar"
                        value={odeme.tutar}
                        onChange={e => updateOdeme(i, "tutar", e.target.value)}
                      />
                      <Input
                        className="h-8 text-xs flex-1"
                        type="date"
                        value={odeme.tarih}
                        onChange={e => updateOdeme(i, "tarih", e.target.value)}
                      />
                      <Button
                        variant="ghost" size="icon"
                        className="h-8 w-8 text-destructive shrink-0"
                        onClick={() => removeOdeme(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {hesaplar.length > 0 && (
                      <Select
                        value={odeme.hesap_id || "__none__"}
                        onValueChange={v => updateOdeme(i, "hesap_id", v === "__none__" ? "" : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Hesap (isteğe bağlı)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Hesap seçilmedi —</SelectItem>
                          {hesaplar.filter(h => h.aktif).map(h => (
                            <SelectItem key={h.id} value={h.id}>{h.ad}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Input
                      className="h-8 text-xs"
                      placeholder="Açıklama (isteğe bağlı)"
                      value={odeme.aciklama}
                      onChange={e => updateOdeme(i, "aciklama", e.target.value)}
                    />
                  </div>
                ))}
                {(() => {
                  const toplam = (parseFloat(form.tutar) || 0) + (parseFloat(form.nakliye_tutari) || 0)
                  const odenen = odemeSatirlar.reduce((s, o) => s + (parseFloat(o.tutar) || 0), 0)
                  const kalan = toplam - odenen
                  if (toplam <= 0) return null
                  return (
                    <div className="flex justify-between text-xs px-1 pt-1">
                      <span className="text-muted-foreground">Ödenen: {formatCurrency(odenen)}</span>
                      {kalan > 0.005 && <span className="text-orange-500">Kalan: {formatCurrency(kalan)}</span>}
                      {kalan >= -0.005 && kalan <= 0.005 && <span className="text-green-600 font-medium">Ödendi</span>}
                      {kalan < -0.005 && <span className="text-red-500 font-medium">Fazla Ödeme: {formatCurrency(-kalan)}</span>}
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          {/* Vade tarihi — isteğe bağlı */}
          <div className="space-y-1.5">
            <Label>Vade Tarihi (isteğe bağlı)</Label>
            <Input type="date" value={form.vade_tarihi} onChange={e => setF("vade_tarihi", e.target.value)} />
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

          {/* ── Hizmet Gider: gelir işlemi ilişkilendirme ───────────────── */}
          {isHizmetGider && (
            <div className="space-y-1.5">
              <div className="relative flex items-center gap-2 py-1">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground shrink-0">İlişkilendirme</span>
                <div className="flex-1 border-t border-border" />
              </div>
              <Label>İlgili Gelir İşlemi — isteğe bağlı</Label>
              <Select
                value={form.bagli_gelir_islem_id || "__none__"}
                onValueChange={v => setF("bagli_gelir_islem_id", v === "__none__" ? "" : v)}
              >
                <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— Bağlantı Yok —</SelectItem>
                  {gelirIslemleri.map(g => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.aciklama} · {formatDate(g.tarih)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Bu hizmet gideri seçilen gelir işleminin net kâr hesabına dahil edilir.</p>
            </div>
          )}

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
                      <div key={i} className="grid grid-cols-[1fr_auto_32px] gap-2 items-end">
                        <div className="space-y-1">
                          {i === 0 && <Label className="text-xs">Malzeme</Label>}
                          <Select value={satir.malzeme_id} onValueChange={v => onMalzemeSelect(i, v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Seçin..." /></SelectTrigger>
                            <SelectContent>
                              {malzemeler.filter(m => m.stok > 0 || m.id === satir.malzeme_id).map(m => {
                                return (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.ad} · {m.stok} {m.birim}
                                    {m.son_birim_fiyat ? ` · ${formatCurrency(m.son_birim_fiyat)}/${m.birim}` : ""}
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          {i === 0 && <Label className="text-xs">Miktar</Label>}
                          <div className="flex items-center gap-1">
                            <Input className="h-8 text-xs w-20" type="number" min="0" step="0.001" value={satir.miktar} onChange={e => updateStokSatir(i, "miktar", e.target.value)} placeholder="0" />
                            {secili && <span className="text-xs text-muted-foreground whitespace-nowrap">{secili.birim}</span>}
                          </div>
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

          {/* ── Gelir: maliyet özeti ve net kâr (okunabilir) ────────────── */}
          {form.tur === "gelir" && (() => {
            const tutar = parseFloat(form.tutar) || 0
            const stokMaliyeti = stokSatirlar.reduce((s, satir) =>
              s + (parseFloat(satir.miktar) || 0) * (parseFloat(satir.birim_fiyat) || 0), 0)
            const hizmetToplam = bagliGiderler.reduce((s, g) => s + g.tutar + (g.nakliye_tutari ?? 0), 0)
            const toplamGider = stokMaliyeti + hizmetToplam
            if (toplamGider === 0 && bagliGiderler.length === 0) return null
            const net = tutar - toplamGider
            return (
              <div className="space-y-2">
                {bagliGiderler.length > 0 && (
                  <>
                    <div className="relative flex items-center gap-2 py-1">
                      <div className="flex-1 border-t border-border" />
                      <span className="text-xs text-muted-foreground shrink-0">Bağlı Giderler</span>
                      <div className="flex-1 border-t border-border" />
                    </div>
                    <div className="rounded-md border border-border bg-muted/30 divide-y divide-border text-xs">
                      {bagliGiderler.map(g => (
                        <div key={g.id} className="flex items-center justify-between px-3 py-2">
                          <div>
                            <p className="font-medium">{g.aciklama}</p>
                            <p className="text-muted-foreground">{formatDate(g.tarih)} · {g.kategori}</p>
                          </div>
                          <span className="text-red-500 font-medium shrink-0 ml-2">
                            -{formatCurrency(g.tutar + (g.nakliye_tutari ?? 0))}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {toplamGider > 0 && (
                  <div className="rounded-md border border-border divide-y divide-border text-xs">
                    {stokMaliyeti > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                        <span>Malzeme Maliyeti</span>
                        <span className="text-red-500 font-medium">-{formatCurrency(stokMaliyeti)}</span>
                      </div>
                    )}
                    {hizmetToplam > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                        <span>Hizmet Giderleri</span>
                        <span className="text-red-500 font-medium">-{formatCurrency(hizmetToplam)}</span>
                      </div>
                    )}
                    <div className={`flex items-center justify-between px-3 py-2 font-semibold ${net >= 0 ? "text-green-700 bg-green-50" : "text-red-600 bg-red-50"}`}>
                      <span>Net Kâr</span>
                      <span>{net >= 0 ? "+" : ""}{formatCurrency(net)}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

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
