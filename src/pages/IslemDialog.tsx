import { useEffect, useState, useMemo } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"
import { supabase, type Islem, type MalzemeWithStok, type Hesap, type AppUser, type Demirbase } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { useSirket } from "@/contexts/SirketContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"

const KATEGORILER = ["Satış", "Hizmet", "Kira", "Maaş", "Malzeme", "Demirbaş", "Demirbaş Satışı", "Fatura", "Vergi", "Noter", "Harç", "Muhasebe", "Gıda", "Sigorta", "Akaryakıt", "Diğer"]
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
  /** Boş ise yeni malzeme tanımlanır; dolu ise mevcut malzemenin stoğuna eklenir. */
  mevcut_id: string
  ad: string
  mal_kategori: string
  birim: string
  miktar: string
  min_miktar: string
}

const defaultMalzemeAlt: MalzemeAlt = {
  mevcut_id: "",
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
  adet: string
  /** true ise adet kadar ayrı kayıt açılır (seri no / zimmet ayrı izlenebilsin diye). */
  ayriKaydet: boolean
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
  adet: "1",
  ayriKaydet: false,
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
  const { aktifSirketId } = useSirket()
  const [form, setForm] = useState(defaultForm)
  const [stokSatirlar, setStokSatirlar] = useState<StokSatir[]>([])
  const [stokEkle, setStokEkle] = useState(false)
  const [odemeSatirlar, setOdemeSatirlar] = useState<OdemeSatir[]>([])
  const [malzemeAlt, setMalzemeAlt] = useState<MalzemeAlt>(defaultMalzemeAlt)
  const [linkedMalzemeId, setLinkedMalzemeId] = useState<string | null>(null)
  const [demirbasAlt, setDemirbasAlt] = useState<DemirbasAlt>(defaultDemirbasAlt)
  const [linkedDemirbasId, setLinkedDemirbasId] = useState<string | null>(null)
  // Bu işleme bağlı demirbaş kaydı sayısı; 1'den fazlaysa alt form devre dışı kalır.
  const [bagliDemirbasSayisi, setBagliDemirbasSayisi] = useState(0)
  const [kullanicilar, setKullanicilar] = useState<AppUser[]>([])
  const [bagliGiderler, setBagliGiderler] = useState<Islem[]>([])
  // Demirbaş Satışı geliri: hangi demirbaş, kaç adet satılıyor
  const [satilabilirler, setSatilabilirler] = useState<Demirbase[]>([])
  const [satisDemirbasId, setSatisDemirbasId] = useState("")
  const [satisAdet, setSatisAdet] = useState("1")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMalzemeGider = form.tur === "gider" && form.kategori === "Malzeme"
  const isDemirbasGider = form.tur === "gider" && form.kategori === "Demirbaş"
  const isHizmetGider = form.tur === "gider" && form.kategori === "Hizmet"
  const isDemirbasSatis = form.tur === "gelir" && form.kategori === "Demirbaş Satışı"

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
    // Önceki denemede takılı kalmış olabilir; yoksa Kaydet butonu kalıcı devre dışı kalır.
    setSaving(false)
    setLinkedMalzemeId(null)
    setMalzemeAlt(defaultMalzemeAlt)
    setLinkedDemirbasId(null)
    setBagliDemirbasSayisi(0)
    setDemirbasAlt(defaultDemirbasAlt)
    setOdemeSatirlar([])
    setBagliGiderler([])
    setSatisDemirbasId("")
    setSatisAdet("1")

    // Demirbaş Satışı seçilebilmesi için eldeki demirbaşlar + bu işleme bağlı
    // (düzenlemede zaten satılmış olan) kayıtlar.
    if (aktifSirketId) {
      supabase.from("demirbaslar").select("*").eq("sirket_id", aktifSirketId).order("ad")
        .then(({ data }) => {
          const hepsi = (data ?? []) as Demirbase[]
          const bagli = editing ? hepsi.filter(d => d.satis_islem_id === editing.id) : []
          setSatilabilirler([
            ...hepsi.filter(d => !["satildi", "hurda", "devredildi"].includes(d.durum)),
            ...bagli,
          ])
          if (bagli.length > 0) {
            setSatisDemirbasId(bagli[0].id)
            setSatisAdet(String(bagli[0].adet ?? 1))
          }
        })
    }

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
            if (m) setMalzemeAlt({ mevcut_id: "", ad: m.ad, mal_kategori: m.kategori, birim: m.birim, miktar: String(giris.miktar), min_miktar: String(m.min_miktar) })
          })
      } else if (editing.tur === "gider" && editing.kategori === "Demirbaş") {
        // Bu işlem birden fazla demirbaş kaydı üretmiş olabilir (ayrı ayrı kaydedilmişse),
        // o yüzden maybeSingle() kullanılamaz.
        supabase.from("demirbaslar").select("*").eq("kaynak_islem_id", editing.id).order("ad")
          .then(({ data }) => {
            const kayitlar = data ?? []
            setBagliDemirbasSayisi(kayitlar.length)
            if (kayitlar.length !== 1) return
            const d = kayitlar[0]
            setLinkedDemirbasId(d.id)
            setDemirbasAlt({ ad: d.ad, db_kategori: d.kategori, marka: d.marka ?? "", model: d.model ?? "", seri_no: d.seri_no ?? "", konum: d.konum ?? "", garanti_bitis: d.garanti_bitis ?? "", zimmet_kullanici_id: d.zimmet_kullanici_id ?? "", zimmet_tarihi: d.zimmet_tarihi ?? "", adet: String(d.adet ?? 1), ayriKaydet: false })
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
            if (m) setMalzemeAlt({ mevcut_id: "", ad: m.ad, mal_kategori: m.kategori, birim: m.birim, miktar: String(giris.miktar), min_miktar: String(m.min_miktar) })
          })
      } else if (initialValues.tur === "gider" && initialValues.kategori === "Demirbaş") {
        supabase.from("demirbaslar").select("*").eq("kaynak_islem_id", initialValues.id).order("ad").limit(1)
          .then(({ data }) => {
            const d = (data ?? [])[0]
            if (d) setDemirbasAlt({ ad: d.ad, db_kategori: d.kategori, marka: d.marka ?? "", model: d.model ?? "", seri_no: d.seri_no ?? "", konum: d.konum ?? "", garanti_bitis: d.garanti_bitis ?? "", zimmet_kullanici_id: d.zimmet_kullanici_id ?? "", zimmet_tarihi: d.zimmet_tarihi ?? "", adet: String(d.adet ?? 1), ayriKaydet: false })
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

  function setDA(field: keyof DemirbasAlt, value: string | boolean) {
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
    if (!form.aciklama || !form.tutar || !form.tarih) {
      setError("Açıklama, tutar ve tarih zorunludur.")
      return
    }
    if (isMalzemeGider && !malzemeAlt.miktar) {
      setError("Stok bilgisi için miktar zorunludur.")
      return
    }
    if (isMalzemeGider && !malzemeAlt.mevcut_id && !linkedMalzemeId && !malzemeAlt.ad) {
      setError("Yeni malzeme için ad zorunludur.")
      return
    }
    if (isDemirbasGider && !demirbasAlt.ad) {
      setError("Demirbaş adı zorunludur.")
      return
    }

    setSaving(true)
    setError(null)

    try {
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
        sirket_id: aktifSirketId,
      }

      let islemId: string

      if (editing) {
        const { error } = await supabase.from("islemler").update(islemPayload).eq("id", editing.id)
        if (error) { setError(error.message); return }
        islemId = editing.id
        await supabase.from("odemeler").delete().eq("islem_id", islemId)
        await supabase.from("islem_stok").delete().eq("islem_id", islemId)
        // Kategori Malzeme'den başka bir türe değiştiyse bağlı malzeme kaydını sil
        if (linkedMalzemeId && !isMalzemeGider) {
          await supabase.from("malzemeler").delete().eq("id", linkedMalzemeId)
        }
      } else {
        const { data, error } = await supabase.from("islemler").insert(islemPayload).select().single()
        if (error) { setError(error.message); return }
        islemId = data.id
      }

      // Ödeme satırlarını kaydet
      if (gecerliOdemeler.length > 0) {
        const { error: odemeErr } = await supabase.from("odemeler").insert(
          gecerliOdemeler.map(o => ({
            islem_id: islemId,
            tarih: o.tarih,
            tutar: parseFloat(o.tutar),
            hesap_id: o.hesap_id || null,
            aciklama: o.aciklama || null,
            kullanici_id: user!.id,
            sirket_id: aktifSirketId,
          }))
        )
        if (odemeErr) { setError(odemeErr.message); return }
      }

      // ── Demirbaş gider: demirbaş kaydı oluştur / güncelle ────────────────
      if (isDemirbasGider) {
        const adet = Math.max(1, parseInt(demirbasAlt.adet) || 1)
        // alis_fiyati BİRİM fiyattır; işlem tutarı grubun tamamını kapsar.
        const birimFiyat = toplam / adet
        const ayriKayitlar = demirbasAlt.ayriKaydet && adet > 1

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
          alis_fiyati: birimFiyat,
          alis_tarihi: form.tarih,
          durum: "aktif" as const,
          kaynak_islem_id: islemId,
          updated_at: new Date().toISOString(),
        }
        if (linkedDemirbasId) {
          const { error: dbErr } = await supabase.from("demirbaslar")
            .update({ ...demirbasPayload, adet: ayriKayitlar ? 1 : adet })
            .eq("id", linkedDemirbasId)
          if (dbErr) { setError(dbErr.message); return }
        } else if (ayriKayitlar) {
          // Her eşya ayrı satır: seri no / zimmet / durum tek tek izlenebilsin.
          const { error: dbErr } = await supabase.from("demirbaslar").insert(
            Array.from({ length: adet }, (_, i) => ({
              ...demirbasPayload,
              ad: `${demirbasAlt.ad} #${i + 1}`,
              adet: 1,
              sirket_id: aktifSirketId,
            }))
          )
          if (dbErr) { setError(dbErr.message); return }
        } else {
          const { error: dbErr } = await supabase.from("demirbaslar")
            .insert({ ...demirbasPayload, adet, sirket_id: aktifSirketId })
          if (dbErr) { setError(dbErr.message); return }
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
          sirket_id: aktifSirketId,
        }

        let malzemeId = linkedMalzemeId
        if (malzemeId) {
          await supabase.from("malzemeler").update({ ...malzemePayload, updated_at: new Date().toISOString() }).eq("id", malzemeId)
        } else if (malzemeAlt.mevcut_id) {
          // Mevcut malzemenin stoğuna ekleme: tanımına dokunulmaz, yalnızca giriş yazılır.
          malzemeId = malzemeAlt.mevcut_id
        } else {
          const { data: newM, error: mErr } = await supabase.from("malzemeler").insert(malzemePayload).select("id").single()
          if (mErr) { setError(mErr.message); return }
          malzemeId = newM?.id ?? null
        }

        if (malzemeId) {
          const { error: stokErr } = await supabase.from("islem_stok").insert({
            islem_id: islemId,
            malzeme_id: malzemeId,
            miktar,
            tur: "giris",
            birim_fiyat: birimFiyat,
            tarih: form.tarih,
            sirket_id: aktifSirketId,
          })
          if (stokErr) { setError(stokErr.message); return }
        }
      }

      // ── Gelir: stoktan çıkış ───────────────────────────────────────────────
      if (form.tur === "gelir" && stokEkle && stokSatirlar.length > 0) {
        const gecerli = stokSatirlar.filter(s => s.malzeme_id && parseFloat(s.miktar) > 0)
        if (gecerli.length > 0) {
          const { error: cikisErr } = await supabase.from("islem_stok").insert(
            gecerli.map(s => ({
              islem_id: islemId,
              malzeme_id: s.malzeme_id,
              miktar: parseFloat(s.miktar),
              tur: "cikis",
              birim_fiyat: parseFloat(s.birim_fiyat || "0"),
              tarih: form.tarih,
              sirket_id: aktifSirketId,
            }))
          )
          if (cikisErr) { setError(cikisErr.message); return }
        }
      }

      // ── Demirbaş Satışı geliri: seçilen demirbaşı satıldı olarak işaretle ──
      if (isDemirbasSatis && satisDemirbasId) {
        const d = satilabilirler.find(x => x.id === satisDemirbasId)
        if (d) {
          const mevcut = d.adet ?? 1
          const satilan = Math.max(1, Math.min(mevcut, parseInt(satisAdet) || 1))
          const satisAlanlari = {
            durum: "satildi" as const,
            satis_tarihi: form.tarih,
            satis_fiyati: toplam / satilan,
            satis_islem_id: islemId,
            updated_at: new Date().toISOString(),
          }

          if (satilan >= mevcut) {
            const { error: sErr } = await supabase.from("demirbaslar")
              .update({ ...satisAlanlari, adet: satilan }).eq("id", d.id)
            if (sErr) { setError(sErr.message); return }
          } else {
            // Kısmi satış: kalanı yerinde bırak, satılanı ayrı satıra taşı.
            const { error: kErr } = await supabase.from("demirbaslar")
              .update({ adet: mevcut - satilan, updated_at: new Date().toISOString() })
              .eq("id", d.id)
            if (kErr) { setError(kErr.message); return }

            const { error: yErr } = await supabase.from("demirbaslar").insert({
              ad: d.ad, kategori: d.kategori, marka: d.marka, model: d.model,
              seri_no: d.seri_no, adet: satilan,
              alis_tarihi: d.alis_tarihi, alis_fiyati: d.alis_fiyati,
              konum: d.konum, garanti_bitis: d.garanti_bitis, notlar: d.notlar,
              kaynak_islem_id: d.kaynak_islem_id,
              sirket_id: aktifSirketId,
              ...satisAlanlari,
            })
            if (yErr) { setError(yErr.message); return }
          }
        }
      }

      onSaved()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Beklenmeyen bir hata oluştu.")
    } finally {
      setSaving(false)
    }
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

            {/* Düzenlemede malzeme zaten bağlı; seçim gösterilmez. */}
            {!linkedMalzemeId && (
              <div className="space-y-1.5">
                <Label>Malzeme</Label>
                <Select
                  value={malzemeAlt.mevcut_id || "yeni"}
                  onValueChange={v => {
                    if (v === "yeni") { setMA("mevcut_id", ""); return }
                    const m = malzemeler.find(x => x.id === v)
                    setMalzemeAlt(prev => ({
                      ...prev,
                      mevcut_id: v,
                      ad: m?.ad ?? prev.ad,
                      mal_kategori: m?.kategori ?? prev.mal_kategori,
                      birim: m?.birim ?? prev.birim,
                      min_miktar: m != null ? String(m.min_miktar) : prev.min_miktar,
                    }))
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yeni">+ Yeni malzeme tanımla</SelectItem>
                    {malzemeler.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.ad} · mevcut {m.stok} {m.birim}
                        {m.son_birim_fiyat ? ` · ${formatCurrency(m.son_birim_fiyat)}/${m.birim}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {malzemeAlt.mevcut_id && (
                  <p className="text-xs text-muted-foreground">
                    Bu alış mevcut stoğa eklenir. Malzeme tanımı değişmez; birim fiyat bu alıştan güncellenir.
                  </p>
                )}
              </div>
            )}

            {/* Yeni malzeme tanımı — mevcut malzeme seçildiyse gerekmez */}
            {!malzemeAlt.mevcut_id && (
              <>
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
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Miktar *</Label>
                <Input type="number" min="0" step="0.001" value={malzemeAlt.miktar} onChange={e => setMA("miktar", e.target.value)} placeholder="0" />
              </div>
              {!malzemeAlt.mevcut_id && (
                <div className="space-y-1.5">
                  <Label>Min. Stok</Label>
                  <Input type="number" min="0" value={malzemeAlt.min_miktar} onChange={e => setMA("min_miktar", e.target.value)} placeholder="0" />
                </div>
              )}
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

            {bagliDemirbasSayisi > 1 ? (
              <div className="rounded-md bg-muted border px-3 py-2 text-xs text-muted-foreground">
                Bu işlem <strong>{bagliDemirbasSayisi} ayrı demirbaş kaydı</strong> oluşturmuş.
                Her birini Demirbaşlar sayfasından tek tek düzenleyebilirsin; buradan toplu düzenleme yapılamaz.
              </div>
            ) : (
            <>
            <div className="space-y-1.5">
              <Label>Demirbaş Adı *</Label>
              <Input value={demirbasAlt.ad} onChange={e => setDA("ad", e.target.value)} placeholder="ör. MacBook Pro 14, Çalışma Masası" />
            </div>

            <div className="space-y-1.5">
              <Label>Adet</Label>
              <Input
                type="number" min="1" step="1"
                value={demirbasAlt.adet}
                onChange={e => setDA("adet", e.target.value)}
              />
              {(parseInt(demirbasAlt.adet) || 1) > 1 && (
                <>
                  <label className="flex items-start gap-2 pt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border mt-0.5"
                      checked={demirbasAlt.ayriKaydet}
                      onChange={e => setDA("ayriKaydet", e.target.checked)}
                    />
                    <span className="text-xs text-muted-foreground">
                      Her birini ayrı kaydet — seri no, zimmet ve durumu tek tek izlemek için
                      ({parseInt(demirbasAlt.adet) || 1} ayrı kayıt açılır)
                    </span>
                  </label>
                  {form.tutar && (
                    <p className="text-xs text-muted-foreground">
                      Birim fiyat: {formatCurrency((parseFloat(form.tutar) || 0) / (parseInt(demirbasAlt.adet) || 1))}
                    </p>
                  )}
                </>
              )}
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
            </>
            )}

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

          {/* ── Gelir: Demirbaş Satışı ise demirbaş seç ─────────────────── */}
          {isDemirbasSatis && (() => {
            const secili = satilabilirler.find(d => d.id === satisDemirbasId)
            const mevcut = secili?.adet ?? 1
            const satilan = Math.max(1, Math.min(mevcut, parseInt(satisAdet) || 1))
            return (
              <div className="space-y-3 border border-border rounded-lg p-3">
                <p className="text-sm font-medium">Satılan Demirbaş</p>
                <Select value={satisDemirbasId} onValueChange={v => { setSatisDemirbasId(v); setSatisAdet("1") }}>
                  <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                  <SelectContent>
                    {satilabilirler.length === 0 ? (
                      <SelectItem value="bos" disabled>Satılabilir demirbaş yok</SelectItem>
                    ) : satilabilirler.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.ad}{(d.adet ?? 1) > 1 ? ` · ${d.adet} adet` : ""}
                        {d.alis_fiyati != null ? ` · ${formatCurrency(d.alis_fiyati)}/adet` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {secili && mevcut > 1 && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Satılan Adet</Label>
                    <Input
                      type="number" min="1" max={mevcut} step="1"
                      className="h-8 text-xs w-24"
                      value={satisAdet}
                      onChange={e => setSatisAdet(e.target.value)}
                    />
                    {satilan < mevcut && (
                      <p className="text-xs text-muted-foreground">
                        Kalan {mevcut - satilan} adet envanterde kalacak.
                      </p>
                    )}
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Kaydedince seçilen demirbaş <strong>Satıldı</strong> olarak işaretlenir ve envanterden düşer.
                </p>
              </div>
            )
          })()}

          {/* ── Gelir: stoktan çıkış ────────────────────────────────────── */}
          {form.tur === "gelir" && !isDemirbasSatis && (
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
            // Demirbaş satışında maliyet, satılan adedin alış bedelidir.
            const secilenDemirbas = isDemirbasSatis ? satilabilirler.find(d => d.id === satisDemirbasId) : undefined
            const demirbasMaliyeti = secilenDemirbas
              ? (secilenDemirbas.alis_fiyati ?? 0) *
                Math.max(1, Math.min(secilenDemirbas.adet ?? 1, parseInt(satisAdet) || 1))
              : 0
            const toplamGider = stokMaliyeti + hizmetToplam + demirbasMaliyeti
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
                    {demirbasMaliyeti > 0 && (
                      <div className="flex items-center justify-between px-3 py-2 text-muted-foreground">
                        <span>Demirbaş Maliyeti</span>
                        <span className="text-red-500 font-medium">-{formatCurrency(demirbasMaliyeti)}</span>
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
