import { useState } from "react"
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
}

const defaultForm = {
  kaynak_hesap_id: "",
  hedef_hesap_id: "",
  tutar: "",
  tarih: new Date().toISOString().slice(0, 10),
  aciklama: "",
}

export function TransferDialog({ open, onClose, hesaplar, onSaved }: Props) {
  const { user } = useAuth()
  const [form, setForm] = useState(defaultForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

    const eslesmeId = crypto.randomUUID()
    const kaynak = hesaplar.find(h => h.id === form.kaynak_hesap_id)
    const hedef = hesaplar.find(h => h.id === form.hedef_hesap_id)

    // Şirket hesabı ile Ortak/Çalışan hesabı arasındaki transferler "Cari Hesap" olarak işaretlenir
    const kaynakSahip = kaynak?.sahip_tipi ?? "sirket"
    const hedefSahip = hedef?.sahip_tipi ?? "sirket"
    const isCari =
      (kaynakSahip !== "sirket" && hedefSahip === "sirket") ||
      (kaynakSahip === "sirket" && hedefSahip !== "sirket")
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

  const cariOnizleme = (() => {
    const kaynak = hesaplar.find(h => h.id === form.kaynak_hesap_id)
    const hedef = hesaplar.find(h => h.id === form.hedef_hesap_id)
    if (!kaynak || !hedef) return null
    const kaynakSahip = kaynak.sahip_tipi ?? "sirket"
    const hedefSahip = hedef.sahip_tipi ?? "sirket"
    const isCari =
      (kaynakSahip !== "sirket" && hedefSahip === "sirket") ||
      (kaynakSahip === "sirket" && hedefSahip !== "sirket")
    if (!isCari) return null
    const kisiSahip = kaynakSahip !== "sirket" ? kaynakSahip : hedefSahip
    const etiket = kisiSahip === "ortak" ? "Ortak" : "Çalışan"
    return kaynakSahip !== "sirket" ? `${etiket}lardan Borç` : `${etiket}lara Borç İade`
  })()

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Hesaplar Arası Transfer</DialogTitle>
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

          {cariOnizleme && (
            <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
              Bu transfer otomatik olarak <strong>"{cariOnizleme}"</strong> cari hareketi olarak kaydedilecek.
            </div>
          )}

          <div className="space-y-1.5">
            <Label>{cariOnizleme ? "Ek Not (isteğe bağlı)" : "Açıklama (isteğe bağlı)"}</Label>
            <Input value={form.aciklama} onChange={e => f("aciklama", e.target.value)} placeholder={cariOnizleme ? "ör. Mart ayı avansı..." : "ör. Maaş ödemesi, kasa çekimi..."} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={handleClose}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Transfer Yap
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
