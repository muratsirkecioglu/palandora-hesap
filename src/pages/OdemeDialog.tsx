import { useEffect, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"
import { supabase, type Islem, type Odeme } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency, formatDate } from "@/lib/utils"

interface Props {
  open: boolean
  onClose: () => void
  islem: Islem | null
  onSaved: () => void
}

export function OdemeDialog({ open, onClose, islem, onSaved }: Props) {
  const { user, isAdmin } = useAuth()
  const [odemeler, setOdemeler] = useState<Odeme[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ tarih: new Date().toISOString().slice(0, 10), tutar: "", aciklama: "" })
  const [saving, setSaving] = useState(false)

  async function loadOdemeler() {
    if (!islem) return
    setLoading(true)
    const { data } = await supabase.from("odemeler").select("*").eq("islem_id", islem.id).order("tarih")
    setOdemeler((data ?? []) as Odeme[])
    setLoading(false)
  }

  useEffect(() => {
    if (open && islem) {
      loadOdemeler()
      setForm({ tarih: new Date().toISOString().slice(0, 10), tutar: "", aciklama: "" })
    }
  }, [open, islem])

  async function handleEkle() {
    if (!islem || !form.tutar || parseFloat(form.tutar) <= 0) return
    setSaving(true)
    await supabase.from("odemeler").insert({
      islem_id: islem.id,
      tarih: form.tarih,
      tutar: parseFloat(form.tutar),
      aciklama: form.aciklama || null,
      kullanici_id: user!.id,
    })
    setForm({ tarih: new Date().toISOString().slice(0, 10), tutar: "", aciklama: "" })
    setSaving(false)
    await loadOdemeler()
    onSaved()
  }

  async function handleSil(id: string) {
    if (!confirm("Bu ödeme kaydını silmek istediğinize emin misiniz?")) return
    await supabase.from("odemeler").delete().eq("id", id)
    await loadOdemeler()
    onSaved()
  }

  if (!islem) return null

  const kalan = islem.tutar - islem.odenen_tutar
  const maxOdeme = Math.max(0, kalan)

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ödeme Takibi</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-1">

          {/* İşlem özeti */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
            <p className="font-medium">{islem.aciklama}</p>
            <div className="flex justify-between text-muted-foreground">
              <span>Toplam Tutar</span>
              <span className="font-medium text-foreground">{formatCurrency(islem.tutar)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Ödenen</span>
              <span className="font-medium text-green-600">{formatCurrency(islem.odenen_tutar)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground border-t border-border pt-1 mt-1">
              <span>Kalan</span>
              <span className={`font-bold ${kalan > 0 ? "text-orange-500" : "text-green-600"}`}>
                {formatCurrency(kalan)}
              </span>
            </div>
          </div>

          {/* Ödeme listesi */}
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : odemeler.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2">Henüz ödeme kaydı yok</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ödeme Geçmişi</p>
              {odemeler.map(o => (
                <div key={o.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                  <div>
                    <p className="text-sm font-medium">{formatCurrency(o.tutar)}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(o.tarih)}{o.aciklama ? ` · ${o.aciklama}` : ""}</p>
                  </div>
                  {(isAdmin || o.kullanici_id === user?.id) && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleSil(o.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Yeni ödeme ekle */}
          {kalan > 0 && (
            <div className="space-y-3 border border-border rounded-lg p-3">
              <p className="text-sm font-medium">Yeni Ödeme Ekle</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tutar (₺)</Label>
                  <Input
                    type="number" min="0.01" step="0.01" max={maxOdeme}
                    value={form.tutar}
                    onChange={e => setForm(f => ({ ...f, tutar: e.target.value }))}
                    placeholder={`max ${formatCurrency(maxOdeme)}`}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tarih</Label>
                  <Input type="date" value={form.tarih} onChange={e => setForm(f => ({ ...f, tarih: e.target.value }))} className="h-8 text-sm" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Açıklama (isteğe bağlı)</Label>
                <Input value={form.aciklama} onChange={e => setForm(f => ({ ...f, aciklama: e.target.value }))} placeholder="Açıklama..." className="h-8 text-sm" />
              </div>
              <Button onClick={handleEkle} disabled={saving} size="sm" className="w-full">
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Ödeme Kaydet
              </Button>
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>Kapat</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
