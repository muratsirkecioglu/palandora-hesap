import { useState, useEffect } from "react"
import { Loader2, ArrowRight } from "lucide-react"
import { supabase, type Hesap } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Props {
  open: boolean
  onClose: () => void
  hesaplar: Hesap[]
  onSaved: () => void
  // Dolu ise düzenleme modu: bu transfer_eslesme_id'ye ait transfer yüklenir.
  editingEslesmeId?: string | null
}

const CARI_PREFIXLER = [
  "Ortaklardan Borç",
  "Ortaklara Borç İade",
  "Çalışanlardan Borç",
  "Çalışanlara Borç İade",
]

const defaultForm = {
  kaynak_hesap_id: "",
  hedef_hesap_id: "",
  tutar: "",
  tarih: new Date().toISOString().slice(0, 10),
  aciklama: "",
  // Şirket ↔ ortak/çalışan transferinde kullanıcı tercihi: "cari" | "transfer"
  tipSecim: "cari",
}

export function TransferDialog({ open, onClose, hesaplar, onSaved, editingEslesmeId }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Düzenleme modunda mevcut transferin iki bacağını yükleyip formu doldur.
  useEffect(() => {
    if (!open) return
    if (!editingEslesmeId) { setForm(defaultForm); return }
    let iptal = false
    ;(async () => {
      const { data } = await supabase.from("islemler")
        .select("hesap_id, tur, tutar, tarih, aciklama, kategori")
        .eq("transfer_eslesme_id", editingEslesmeId)
      if (iptal) return
      const legs = (data ?? []) as { hesap_id: string | null; tur: string; tutar: number; tarih: string; aciklama: string; kategori: string }[]
      const gider = legs.find(l => l.tur === "gider")
      const gelir = legs.find(l => l.tur === "gelir")
      if (!gider || !gelir) return
      const tipSecim = gider.kategori === "Cari Hesap" ? "cari" : "transfer"
      const hedef = hesaplar.find(h => h.id === gelir.hesap_id)
      // Açıklamadan kullanıcı notunu ayıkla: "→ hedef" ekini ve cari önekini soy.
      let base = gider.aciklama
      if (hedef) base = base.replace(` → ${hedef.ad}`, "")
      let not = base
      if (tipSecim === "cari") {
        not = ""
        for (const p of CARI_PREFIXLER) {
          if (base === p) { not = ""; break }
          if (base.startsWith(p + " — ")) { not = base.slice((p + " — ").length); break }
        }
      } else if (base === "Hesaplar arası transfer") {
        not = ""
      }
      setForm({
        kaynak_hesap_id: gider.hesap_id ?? "",
        hedef_hesap_id: gelir.hesap_id ?? "",
        tutar: String(gider.tutar),
        tarih: gider.tarih,
        aciklama: not,
        tipSecim,
      })
    })()
    return () => { iptal = true }
  }, [open, editingEslesmeId, hesaplar])

  function f(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError(null)
  }

  function handleClose() {
    setForm(defaultForm)
    setError(null)
    onClose()
  }

  async function handleSave() {
    if (!form.kaynak_hesap_id || !form.hedef_hesap_id || !form.tutar || !form.tarih) {
      setError("Kaynak hesap, hedef hesap ve tutar zorunludur.")
      return
    }
    if (form.kaynak_hesap_id === form.hedef_hesap_id) {
      setError("Kaynak ve hedef hesap aynı olamaz.")
      return
    }
    const tutar = parseFloat(form.tutar)
    if (tutar <= 0) {
      setError("Tutar sıfırdan büyük olmalıdır.")
      return
    }

    setSaving(true)
    setError(null)

    // Düzenleme modu: eski transferin iki bacağını ve ödemelerini sil, yerine yenisini oluştur.
    if (editingEslesmeId) {
      const { data: eskiler } = await supabase.from("islemler").select("id").eq("transfer_eslesme_id", editingEslesmeId)
      const eskiIds = (eskiler ?? []).map(l => l.id)
      if (eskiIds.length) {
        await supabase.from("odemeler").delete().in("islem_id", eskiIds)
        await supabase.from("islemler").delete().in("id", eskiIds)
      }
    }

    const eslesmeId = crypto.randomUUID()
    const kaynak = hesaplar.find(h => h.id === form.kaynak_hesap_id)
    const hedef = hesaplar.find(h => h.id === form.hedef_hesap_id)

    // Şirket hesabı ile Ortak/Çalışan hesabı arasındaki transferler cari olabilir,
    // ama kullanıcı "Normal Transfer" seçerse (ör. masraf iadesi) cariye dahil edilmez.
    const kaynakSahip = kaynak?.sahip_tipi ?? "sirket"
    const hedefSahip = hedef?.sahip_tipi ?? "sirket"
    const cariMumkun =
      (kaynakSahip !== "sirket" && hedefSahip === "sirket") ||
      (kaynakSahip === "sirket" && hedefSahip !== "sirket")
    const isCari = cariMumkun && form.tipSecim === "cari"
    const kategori = isCari ? "Cari Hesap" : "Transfer"

    let aciklama = form.aciklama
    if (isCari) {
      const kisiSahip = kaynakSahip !== "sirket" ? kaynakSahip : hedefSahip
      const etiket = kisiSahip === "ortak" ? "Ortak" : "Çalışan"
      // kaynak kişiyse → kişiden şirkete para geçiyor → borç alma; aksi halde borç iadesi
      aciklama = kaynakSahip !== "sirket" ? `${etiket}lardan Borç` : `${etiket}lara Borç İade`
      if (form.aciklama) aciklama += ` — ${form.aciklama}`
    } else if (!aciklama) {
      aciklama = "Hesaplar arası transfer"
    }

    const { data: inserted, error: err } = await supabase.from("islemler").insert([
      {
        tarih: form.tarih,
        aciklama: `${aciklama} → ${hedef?.ad}`,
        tutar,
        tur: "gider",
        kategori,
        hesap_id: form.kaynak_hesap_id,
        transfer_eslesme_id: eslesmeId,
        faturali: false,
        kullanici_id: user!.id,
      },
      {
        tarih: form.tarih,
        aciklama: `${aciklama} ← ${kaynak?.ad}`,
        tutar,
        tur: "gelir",
        kategori,
        hesap_id: form.hedef_hesap_id,
        transfer_eslesme_id: eslesmeId,
        faturali: false,
        kullanici_id: user!.id,
      },
    ]).select("id")

    if (err || !inserted) { setSaving(false); setError(err?.message ?? "Hata"); return }

    // Transfer ödemeleri oluştur (Hesaplar bakiyesi bu tabloya bakıyor)
    await supabase.from("odemeler").insert([
      { islem_id: inserted[0].id, tarih: form.tarih, tutar, hesap_id: form.kaynak_hesap_id, kullanici_id: user!.id },
      { islem_id: inserted[1].id, tarih: form.tarih, tutar, hesap_id: form.hedef_hesap_id, kullanici_id: user!.id },
    ])

    setSaving(false)
    handleClose()
    onSaved()
  }

  const aktifHesaplar = hesaplar.filter(h => h.aktif)

  // Seçilen hesaplar şirket ↔ ortak/çalışan ise cari seçeneği sunulur.
  // cariEtiket: kullanıcı "Cari Hesap" seçerse uygulanacak açıklama.
  const { cariMumkun, cariEtiket } = (() => {
    const kaynak = hesaplar.find(h => h.id === form.kaynak_hesap_id)
    const hedef = hesaplar.find(h => h.id === form.hedef_hesap_id)
    if (!kaynak || !hedef) return { cariMumkun: false, cariEtiket: "" }
    const kaynakSahip = kaynak.sahip_tipi ?? "sirket"
    const hedefSahip = hedef.sahip_tipi ?? "sirket"
    const mumkun =
      (kaynakSahip !== "sirket" && hedefSahip === "sirket") ||
      (kaynakSahip === "sirket" && hedefSahip !== "sirket")
    if (!mumkun) return { cariMumkun: false, cariEtiket: "" }
    const kisiSahip = kaynakSahip !== "sirket" ? kaynakSahip : hedefSahip
    const etiket = kisiSahip === "ortak" ? "Ortak" : "Çalışan"
    const label = kaynakSahip !== "sirket" ? `${etiket}lardan Borç` : `${etiket}lara Borç İade`
    return { cariMumkun: true, cariEtiket: label }
  })()

  const cariSecili = cariMumkun && form.tipSecim === "cari"

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{editingEslesmeId ? "Transferi Düzenle" : "Hesaplar Arası Transfer"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">

          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>Kaynak Hesap</Label>
              <Select value={form.kaynak_hesap_id} onValueChange={v => f("kaynak_hesap_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                <SelectContent>
                  {aktifHesaplar.map(h => (
                    <SelectItem key={h.id} value={h.id} disabled={h.id === form.hedef_hesap_id}>{h.ad}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground mb-2 shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Label>Hedef Hesap</Label>
              <Select value={form.hedef_hesap_id} onValueChange={v => f("hedef_hesap_id", v)}>
                <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
                <SelectContent>
                  {aktifHesaplar.map(h => (
                    <SelectItem key={h.id} value={h.id} disabled={h.id === form.kaynak_hesap_id}>{h.ad}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tutar (₺)</Label>
              <Input type="number" min="0.01" step="0.01" value={form.tutar} onChange={e => f("tutar", e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Tarih</Label>
              <Input type="date" value={form.tarih} onChange={e => f("tarih", e.target.value)} />
            </div>
          </div>

          {cariMumkun && (
            <div className="space-y-1.5">
              <Label>İşlem Tipi</Label>
              <Select value={form.tipSecim} onValueChange={v => f("tipSecim", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cari">Cari Hesap (Borç/İade)</SelectItem>
                  <SelectItem value="transfer">Normal Transfer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {cariSecili && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
              Bu transfer <strong>"{cariEtiket}"</strong> cari hareketi olarak kaydedilecek ve cari bakiyeye dahil edilecek.
            </div>
          )}
          {cariMumkun && !cariSecili && (
            <div className="rounded-md bg-muted border px-3 py-2 text-xs text-muted-foreground">
              Normal transfer — cari (borç) bakiyesine <strong>dahil edilmez</strong>. Ör. şirkete faturalanan masrafın iadesi ya da borç niteliği taşımayan nakit hareketi.
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{cariSecili ? "Ek Not (isteğe bağlı)" : "Açıklama (isteğe bağlı)"}</Label>
            <Input value={form.aciklama} onChange={e => f("aciklama", e.target.value)} placeholder={cariSecili ? "ör. Mart ayı avansı..." : "ör. Masraf iadesi, maaş ödemesi..."} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingEslesmeId ? "Güncelle" : "Transfer Yap"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
