import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, CreditCard, Package } from "lucide-react"
import { supabase, type Islem, type Malzeme } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"
import { IslemDialog } from "./IslemDialog"
import { OdemeDialog } from "./OdemeDialog"

const ODEME_DURUM_LABEL: Record<string, string> = {
  odendi: "Ödendi",
  kismi_odendi: "Kısmi",
  beklemede: "Beklemede",
}
const ODEME_DURUM_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  odendi: "success",
  kismi_odendi: "warning",
  beklemede: "destructive",
}

export function Finans() {
  const { isAdmin, user } = useAuth()
  const [islemler, setIslemler] = useState<Islem[]>([])
  const [malzemeler, setMalzemeler] = useState<Malzeme[]>([])
  const [stokIslemIds, setStokIslemIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [filterTur, setFilterTur] = useState<"tumu" | "gelir" | "gider">("tumu")
  const [filterOdeme, setFilterOdeme] = useState<"tumu" | "odendi" | "kismi_odendi" | "beklemede">("tumu")
  const [islemDialogOpen, setIslemDialogOpen] = useState(false)
  const [odemeDialogOpen, setOdemeDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Islem | null>(null)
  const [odemeIslem, setOdemeIslem] = useState<Islem | null>(null)

  async function load() {
    setLoading(true)
    const islemQ = supabase.from("islemler").select("*").order("tarih", { ascending: false })
    if (!isAdmin) islemQ.eq("kullanici_id", user!.id)

    const [{ data: islemData }, { data: malzemeData }, { data: stokData }] = await Promise.all([
      islemQ,
      supabase.from("malzemeler").select("*").order("ad"),
      supabase.from("islem_stok").select("islem_id"),
    ])

    setIslemler((islemData ?? []) as Islem[])
    setMalzemeler((malzemeData ?? []) as Malzeme[])
    setStokIslemIds(new Set((stokData ?? []).map((s: { islem_id: string }) => s.islem_id)))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() { setEditing(null); setIslemDialogOpen(true) }
  function openEdit(i: Islem) { setEditing(i); setIslemDialogOpen(true) }
  function openOdeme(i: Islem) { setOdemeIslem(i); setOdemeDialogOpen(true) }

  async function handleDelete(id: string) {
    if (!confirm("Bu işlemi silmek istediğinize emin misiniz?")) return
    await supabase.from("islemler").delete().eq("id", id)
    load()
  }

  const filtered = islemler.filter(i => {
    const turOk = filterTur === "tumu" || i.tur === filterTur
    const odemeOk = filterOdeme === "tumu" || i.odeme_durumu === filterOdeme
    return turOk && odemeOk
  })

  const toplamGelir = islemler.filter(i => i.tur === "gelir").reduce((s, i) => s + i.tutar, 0)
  const toplamGider = islemler.filter(i => i.tur === "gider").reduce((s, i) => s + i.tutar, 0)
  const tahsilEdilecek = islemler
    .filter(i => i.tur === "gelir" && i.odeme_durumu !== "odendi")
    .reduce((s, i) => s + (i.tutar - i.odenen_tutar), 0)
  const odenecek = islemler
    .filter(i => i.tur === "gider" && i.odeme_durumu !== "odendi")
    .reduce((s, i) => s + (i.tutar - i.odenen_tutar), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Finans</h1>
          <p className="text-muted-foreground text-sm">Gelir ve gider takibi</p>
        </div>
        <Button onClick={openNew} size="sm">
          <Plus className="h-4 w-4" /> Yeni İşlem
        </Button>
      </div>

      {/* Özet kartlar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Gelir</p>
          <p className="text-lg font-bold text-green-600">{formatCurrency(toplamGelir)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Toplam Gider</p>
          <p className="text-lg font-bold text-red-500">{formatCurrency(toplamGider)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Tahsil Edilecek</p>
          <p className={`text-lg font-bold ${tahsilEdilecek > 0 ? "text-orange-500" : "text-muted-foreground"}`}>{formatCurrency(tahsilEdilecek)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-1">Ödenecek</p>
          <p className={`text-lg font-bold ${odenecek > 0 ? "text-orange-500" : "text-muted-foreground"}`}>{formatCurrency(odenecek)}</p>
        </CardContent></Card>
      </div>

      {/* Liste */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
            <CardTitle className="text-base">İşlem Listesi</CardTitle>
            <div className="flex gap-2">
              <Select value={filterTur} onValueChange={v => setFilterTur(v as typeof filterTur)}>
                <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tumu">Tümü</SelectItem>
                  <SelectItem value="gelir">Gelir</SelectItem>
                  <SelectItem value="gider">Gider</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterOdeme} onValueChange={v => setFilterOdeme(v as typeof filterOdeme)}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tumu">Tüm Ödemeler</SelectItem>
                  <SelectItem value="odendi">Ödendi</SelectItem>
                  <SelectItem value="kismi_odendi">Kısmi</SelectItem>
                  <SelectItem value="beklemede">Beklemede</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12 text-sm">İşlem bulunamadı</p>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map(islem => {
                const kalan = islem.tutar - islem.odenen_tutar
                const hasStok = stokIslemIds.has(islem.id)
                const canEdit = isAdmin || islem.kullanici_id === user?.id

                return (
                  <div key={islem.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{islem.aciklama}</p>
                        <Badge variant={islem.tur === "gelir" ? "success" : "destructive"} className="text-xs">
                          {islem.tur === "gelir" ? "Gelir" : "Gider"}
                        </Badge>
                        <Badge variant={ODEME_DURUM_VARIANT[islem.odeme_durumu]} className="text-xs">
                          {ODEME_DURUM_LABEL[islem.odeme_durumu]}
                        </Badge>
                        {hasStok && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Package className="h-2.5 w-2.5" /> Stok
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDate(islem.tarih)} · {islem.kategori}
                        {islem.vade_tarihi && ` · Vade: ${formatDate(islem.vade_tarihi)}`}
                      </p>
                      {islem.odeme_durumu !== "odendi" && (
                        <p className="text-xs text-orange-500 mt-0.5">
                          Ödenen: {formatCurrency(islem.odenen_tutar)} · Kalan: {formatCurrency(kalan)}
                        </p>
                      )}
                      {islem.adam_saat != null && (
                        <p className="text-xs text-muted-foreground mt-0.5">Emek: {islem.adam_saat} adam/saat</p>
                      )}
                      {islem.notlar && <p className="text-xs text-muted-foreground italic mt-0.5">{islem.notlar}</p>}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <div className="text-right mr-1">
                        <p className={`font-semibold text-sm ${islem.tur === "gelir" ? "text-green-600" : "text-red-500"}`}>
                          {islem.tur === "gelir" ? "+" : "-"}{formatCurrency(islem.tutar)}
                        </p>
                      </div>
                      {canEdit && (
                        <>
                          {islem.odeme_durumu !== "odendi" && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-500 hover:text-blue-600" title="Ödeme Ekle" onClick={() => openOdeme(islem)}>
                              <CreditCard className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(islem)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(islem.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <IslemDialog
        open={islemDialogOpen}
        onClose={() => setIslemDialogOpen(false)}
        editing={editing}
        malzemeler={malzemeler}
        onSaved={load}
      />
      <OdemeDialog
        open={odemeDialogOpen}
        onClose={() => setOdemeDialogOpen(false)}
        islem={odemeIslem}
        onSaved={load}
      />
    </div>
  )
}
