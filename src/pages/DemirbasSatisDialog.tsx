import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { supabase, type Demirbase, type Hesap } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { useSirket } from "@/contexts/SirketContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency } from "@/lib/utils"

interface Props {
  open: boolean
  onClose: () => void
  demirbas: Demirbase | null
  onSaved: () => void
}

export function DemirbasSatisDialog({ open, onClose, demirbas, onSaved }: Props) {
  const { user } = useAuth()
  const { aktifSirketId } = useSirket()
  const [hesaplar, setHesaplar] = useState<Hesap[]>([])
  const [form, setForm] = useState({
    adet: "1",
    birimFiyat: "",
    tarih: new Date().toISOString().slice(0, 10),
    hesap_id: "",
    aciklama: "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !demirbas || !aktifSirketId) return
    setError(null)
    setSaving(false)
    setForm({
      adet: String(demirbas.adet ?? 1),
      birimFiyat: demirbas.alis_fiyati != null ? String(demirbas.alis_fiyati) : "",
      tarih: new Date().toISOString().slice(0, 10),
      hesap_id: "",
      aciklama: "",
    })
    supabase.from("hesaplar").select("*").eq("sirket_id", aktifSirketId).eq("aktif", true).order("ad")
      .then(({ data }) => setHesaplar((data ?? []) as Hesap[]))
  }, [open, demirbas?.id, aktifSirketId])

  if (!demirbas) return null

  const mevcutAdet = demirbas.adet ?? 1
  const satilanAdet = Math.max(1, Math.min(mevcutAdet, parseInt(form.adet) || 1))
  const birimFiyat = parseFloat(form.birimFiyat) || 0
  const toplamSatis = birimFiyat * satilanAdet
  const maliyet = (demirbas.alis_fiyati ?? 0) * satilanAdet
  const karZarar = toplamSatis - maliyet
  const tamamiSatiliyor = satilanAdet >= mevcutAdet

  async function handleSave() {
    if (!demirbas) return
    if (!form.birimFiyat || toplamSatis <= 0) {
      setError("Satış fiyatı sıfırdan büyük olmalıdır.")
      return
    }
    if (!form.tarih) { setError("Tarih zorunludur."); return }

    setSaving(true)
    setError(null)

    try {
      const aciklama = form.aciklama.trim()
        || `Demirbaş satışı: ${demirbas.ad}${satilanAdet > 1 ? ` (${satilanAdet} adet)` : ""}`

      // 1) Gelir işlemi
      const { data: islem, error: islemErr } = await supabase.from("islemler").insert({
        tarih: form.tarih,
        aciklama,
        tutar: toplamSatis,
        tur: "gelir",
        kategori: "Demirbaş Satışı",
        hesap_id: form.hesap_id || null,
        faturali: false,
        kullanici_id: user!.id,
        sirket_id: aktifSirketId,
      }).select("id").single()
      if (islemErr) { setError(islemErr.message); return }

      // 2) Tahsilat (hesap seçildiyse bakiyeye yansısın)
      if (form.hesap_id) {
        const { error: odemeErr } = await supabase.from("odemeler").insert({
          islem_id: islem.id,
          tarih: form.tarih,
          tutar: toplamSatis,
          hesap_id: form.hesap_id,
          kullanici_id: user!.id,
          sirket_id: aktifSirketId,
        })
        if (odemeErr) { setError(odemeErr.message); return }
      }

      // 3) Demirbaşı güncelle
      const satisAlanlari = {
        durum: "satildi" as const,
        satis_tarihi: form.tarih,
        satis_fiyati: birimFiyat,
        satis_islem_id: islem.id,
        updated_at: new Date().toISOString(),
      }

      if (tamamiSatiliyor) {
        const { error: dErr } = await supabase.from("demirbaslar")
          .update({ ...satisAlanlari, adet: satilanAdet })
          .eq("id", demirbas.id)
        if (dErr) { setError(dErr.message); return }
      } else {
        // Kısmi satış: kalanı orijinal satırda bırak, satılanı ayrı satıra taşı.
        const { error: kalanErr } = await supabase.from("demirbaslar")
          .update({ adet: mevcutAdet - satilanAdet, updated_at: new Date().toISOString() })
          .eq("id", demirbas.id)
        if (kalanErr) { setError(kalanErr.message); return }

        const { error: yeniErr } = await supabase.from("demirbaslar").insert({
          ad: demirbas.ad,
          kategori: demirbas.kategori,
          marka: demirbas.marka,
          model: demirbas.model,
          seri_no: demirbas.seri_no,
          adet: satilanAdet,
          alis_tarihi: demirbas.alis_tarihi,
          alis_fiyati: demirbas.alis_fiyati,
          konum: demirbas.konum,
          garanti_bitis: demirbas.garanti_bitis,
          notlar: demirbas.notlar,
          kaynak_islem_id: demirbas.kaynak_islem_id,
          sirket_id: aktifSirketId,
          ...satisAlanlari,
        })
        if (yeniErr) { setError(yeniErr.message); return }
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Demirbaş Satışı</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="rounded-md bg-muted px-3 py-2 text-sm">
            <p className="font-medium">{demirbas.ad}</p>
            <p className="text-xs text-muted-foreground">
              Elde {mevcutAdet} adet · Birim maliyet {formatCurrency(demirbas.alis_fiyati ?? 0)}
            </p>
          </div>

          {mevcutAdet > 1 && (
            <div className="space-y-1.5">
              <Label>Satılan Adet</Label>
              <Input
                type="number" min="1" max={mevcutAdet} step="1"
                value={form.adet}
                onChange={e => { setForm(f => ({ ...f, adet: e.target.value })); setError(null) }}
              />
              {!tamamiSatiliyor && (
                <p className="text-xs text-muted-foreground">
                  Kalan {mevcutAdet - satilanAdet} adet envanterde kalacak.
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Birim Satış Fiyatı (₺)</Label>
              <Input
                type="number" min="0.01" step="0.01"
                value={form.birimFiyat}
                onChange={e => { setForm(f => ({ ...f, birimFiyat: e.target.value })); setError(null) }}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Satış Tarihi</Label>
              <Input
                type="date" value={form.tarih}
                onChange={e => { setForm(f => ({ ...f, tarih: e.target.value })); setError(null) }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tahsilat Hesabı (isteğe bağlı)</Label>
            <Select value={form.hesap_id || "bos"} onValueChange={v => setForm(f => ({ ...f, hesap_id: v === "bos" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Seçin..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bos">— Sonra tahsil edilecek —</SelectItem>
                {hesaplar.map(h => <SelectItem key={h.id} value={h.id}>{h.ad}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Açıklama (isteğe bağlı)</Label>
            <Input
              value={form.aciklama}
              onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))}
              placeholder="ör. Alıcı adı"
            />
          </div>

          {toplamSatis > 0 && (
            <div className="rounded-md border border-border px-3 py-2 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Satış Tutarı</span>
                <span className="font-medium">{formatCurrency(toplamSatis)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Maliyet ({satilanAdet} adet)</span>
                <span className="font-medium">−{formatCurrency(maliyet)}</span>
              </div>
              <div className="flex justify-between border-t border-border pt-1">
                <span className="font-medium">{karZarar >= 0 ? "Kâr" : "Zarar"}</span>
                <span className={`font-semibold ${karZarar >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {karZarar >= 0 ? "+" : ""}{formatCurrency(karZarar)}
                </span>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Kaydedince <strong>Demirbaş Satışı</strong> kategorisinde bir gelir işlemi oluşturulur ve Finans'ta görünür.
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose}>İptal</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Satışı Kaydet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
