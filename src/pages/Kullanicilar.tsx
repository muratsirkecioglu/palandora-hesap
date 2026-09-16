import { useEffect, useState } from "react"
import { Pencil, Loader2, ShieldCheck, Info, AlertTriangle } from "lucide-react"
import { supabase, type AppUser, type Sirket } from "@/lib/supabase"
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
  // sirketRoller: sirket_id → rol. Anahtarın varlığı üyeliği, değeri o şirketteki rolü belirtir.
  const [form, setForm] = useState({
    ad_soyad: "",
    rol: "calisan" as "admin" | "calisan",
    sirketRoller: {} as Record<string, "admin" | "calisan">,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sirketler, setSirketler] = useState<Sirket[]>([])
  // kullanici_id → { sirket_id: rol }
  const [uyelikler, setUyelikler] = useState<Map<string, Record<string, "admin" | "calisan">>>(new Map())

  async function load() {
    setLoading(true)
    const [{ data: ku }, { data: si }, { data: uy }] = await Promise.all([
      supabase.from("kullanicilar").select("*").order("created_at"),
      supabase.from("sirketler").select("*").order("ad"),
      supabase.from("kullanici_sirket").select("kullanici_id, sirket_id, rol"),
    ])
    setKullanicilar((ku ?? []) as AppUser[])
    setSirketler((si ?? []) as Sirket[])

    const map = new Map<string, Record<string, "admin" | "calisan">>()
    for (const r of (uy ?? []) as { kullanici_id: string; sirket_id: string; rol: "admin" | "calisan" }[]) {
      map.set(r.kullanici_id, { ...(map.get(r.kullanici_id) ?? {}), [r.sirket_id]: r.rol })
    }
    setUyelikler(map)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openEdit(u: AppUser) {
    setEditing(u)
    setForm({ ad_soyad: u.ad_soyad, rol: u.rol, sirketRoller: { ...(uyelikler.get(u.id) ?? {}) } })
    setError(null)
    setDialogOpen(true)
  }

  // "yok" = üyelik kaldırılır; "calisan"/"admin" = o rolle üye olur
  function setSirketRol(sirketId: string, deger: string) {
    setForm(f => {
      const yeni = { ...f.sirketRoller }
      if (deger === "yok") delete yeni[sirketId]
      else yeni[sirketId] = deger as "admin" | "calisan"
      return { ...f, sirketRoller: yeni }
    })
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

    // Üyelik farkını uygula: eklenen, kaldırılan ve rolü değişenler
    const mevcut = uyelikler.get(editing.id) ?? {}
    const yeni = form.sirketRoller

    const eklenecek = Object.keys(yeni).filter(id => !(id in mevcut))
    const silinecek = Object.keys(mevcut).filter(id => !(id in yeni))
    const degisen = Object.keys(yeni).filter(id => id in mevcut && mevcut[id] !== yeni[id])

    if (eklenecek.length > 0) {
      const { error: ekErr } = await supabase.from("kullanici_sirket")
        .insert(eklenecek.map(sirket_id => ({ kullanici_id: editing.id, sirket_id, rol: yeni[sirket_id] })))
      if (ekErr) { setError(ekErr.message); setSaving(false); return }
    }
    if (silinecek.length > 0) {
      const { error: silErr } = await supabase.from("kullanici_sirket")
        .delete().eq("kullanici_id", editing.id).in("sirket_id", silinecek)
      if (silErr) { setError(silErr.message); setSaving(false); return }
    }
    for (const sirketId of degisen) {
      const { error: gErr } = await supabase.from("kullanici_sirket")
        .update({ rol: yeni[sirketId] })
        .eq("kullanici_id", editing.id).eq("sirket_id", sirketId)
      if (gErr) { setError(gErr.message); setSaving(false); return }
    }

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
            Ardından buradaki kalem ikonuyla rolünü ve <strong>hangi şirketlere üye olacağını</strong> belirleyin —
            şirket atanmayan kullanıcı hiçbir veri göremez.
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
                      <div className="flex items-center gap-1 flex-wrap mt-1">
                        {Object.keys(uyelikler.get(u.id) ?? {}).length === 0 ? (
                          <Badge variant="outline" className="text-[10px] py-0 gap-1 border-orange-300 text-orange-600">
                            <AlertTriangle className="h-3 w-3" /> Şirket atanmamış
                          </Badge>
                        ) : (
                          sirketler
                            .filter(s => s.id in (uyelikler.get(u.id) ?? {}))
                            .map(s => (
                              <Badge key={s.id} variant="secondary" className="text-[10px] py-0">
                                {s.ad} · {uyelikler.get(u.id)![s.id] === "admin" ? "Yönetici" : "Çalışan"}
                              </Badge>
                            ))
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {u.rol === "admin" && (
                      <Badge variant="default" className="gap-1" title="Şirket açabilir ve üyelik yönetebilir">
                        <ShieldCheck className="h-3 w-3" /> Sistem Yöneticisi
                      </Badge>
                    )}
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
              <Label>Sistem Rolü</Label>
              <Select
                value={form.rol}
                onValueChange={v => setForm(f => ({ ...f, rol: v as "admin" | "calisan" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="calisan">Normal Kullanıcı</SelectItem>
                  <SelectItem value="admin">Sistem Yöneticisi</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Yalnızca şirket açma ve kullanıcı/üyelik yönetimi yetkisini belirler. Şirket içi yetkiler aşağıdaki şirket rolünden gelir.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Şirket Üyelikleri</Label>
              {sirketler.length === 0 ? (
                <p className="text-xs text-muted-foreground">Tanımlı şirket yok.</p>
              ) : (
                <div className="rounded-md border border-border divide-y divide-border">
                  {sirketler.map(s => (
                    <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="text-sm truncate">{s.ad}</span>
                      <Select
                        value={form.sirketRoller[s.id] ?? "yok"}
                        onValueChange={v => setSirketRol(s.id, v)}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs shrink-0"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yok">Üye değil</SelectItem>
                          <SelectItem value="calisan">Çalışan</SelectItem>
                          <SelectItem value="admin">Yönetici</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Rol şirkete özeldir — kullanıcı bir şirkette Yönetici, diğerinde Çalışan olabilir.
                "Üye değil" seçilen şirketin hiçbir verisini göremez.
              </p>
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
