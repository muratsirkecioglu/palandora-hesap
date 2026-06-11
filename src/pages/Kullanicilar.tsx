import { useEffect, useState } from "react"
import { Pencil, Loader2, ShieldCheck, User, Info } from "lucide-react"
import { supabase, type AppUser } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/contexts/AuthContext"

export function Kullanicilar() {
  const { user: currentUser } = useAuth()
  const [kullanicilar, setKullanicilar] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AppUser | null>(null)
  const [form, setForm] = useState({ ad_soyad: "", rol: "calisan" as "admin" | "calisan" })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase.from("kullanicilar").select("*").order("created_at")
    setKullanicilar((data ?? []) as AppUser[])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openEdit(u: AppUser) {
    setEditing(u)
    setForm({ ad_soyad: u.ad_soyad, rol: u.rol })
    setError(null)
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!editing || !form.ad_soyad) return
    setSaving(true)
    setError(null)
    const { error } = await supabase.from("kullanicilar").update({
      ad_soyad: form.ad_soyad,
      rol: form.rol,
    }).eq("id", editing.id)
    if (error) { setError(error.message); setSaving(false); return }
    setSaving(false)
    setDialogOpen(false)
    load()
  }

  async function toggleAktif(u: AppUser) {
    await supabase.from("kullanicilar").update({ aktif: !u.aktif }).eq("id", u.id)
    load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Kullanıcı Yönetimi</h1>
          <p className="text-muted-foreground text-sm">Kullanıcı rolleri ve erişim yönetimi</p>
        </div>
      </div>

      {/* Bilgi notu */}
      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <p className="font-medium mb-1">Yeni kullanıcı nasıl eklenir?</p>
          <p className="text-blue-700">
            Supabase Dashboard → <strong>Authentication → Users → Invite user</strong> ile kullanıcıyı davet edin.
            Daveti kabul edip şifre oluşturunca uygulama otomatik olarak <em>Çalışan</em> rolüyle kaydeder.
            Buradan rolünü değiştirebilirsiniz.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kullanıcılar ({kullanicilar.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : kullanicilar.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">Kullanıcı bulunamadı</p>
          ) : (
            <div className="divide-y divide-border">
              {kullanicilar.map(u => (
                <div key={u.id} className="flex items-center justify-between py-3 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-sm font-semibold text-primary">
                        {u.ad_soyad?.charAt(0)?.toUpperCase() ?? "?"}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{u.ad_soyad}</p>
                        {u.id === currentUser?.id && (
                          <Badge variant="outline" className="text-xs">Siz</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant={u.rol === "admin" ? "default" : "secondary"} className="gap-1">
                      {u.rol === "admin"
                        ? <><ShieldCheck className="h-3 w-3" /> Yönetici</>
                        : <><User className="h-3 w-3" /> Çalışan</>
                      }
                    </Badge>
                    <Badge variant={u.aktif ? "success" : "outline"}>
                      {u.aktif ? "Aktif" : "Pasif"}
                    </Badge>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => openEdit(u)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {u.id !== currentUser?.id && (
                      <Button
                        variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => toggleAktif(u)}
                      >
                        {u.aktif ? "Pasif Yap" : "Aktif Yap"}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Düzenleme dialogu */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Kullanıcıyı Düzenle</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Ad Soyad</Label>
              <Input
                value={form.ad_soyad}
                onChange={e => setForm(f => ({ ...f, ad_soyad: e.target.value }))}
                placeholder="Ad Soyad"
              />
            </div>
            <div className="space-y-1.5">
              <Label>E-posta</Label>
              <Input value={editing?.email ?? ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select
                value={form.rol}
                onValueChange={v => setForm(f => ({ ...f, rol: v as "admin" | "calisan" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="calisan">Çalışan</SelectItem>
                  <SelectItem value="admin">Yönetici (Admin)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>İptal</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Kaydet
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
