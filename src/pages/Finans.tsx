import { useEffect, useState } from "react"
import { Plus, Pencil, Trash2, Loader2, Package, ArrowLeftRight, FileCheck, FileX, Copy } from "lucide-react"
import { supabase, type Islem, type MalzemeWithFiyat, type Hesap } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { formatCurrency, formatDate } from "@/lib/utils"
import { IslemDialog } from "./IslemDialog"

function ayGrupla(list: Islem[]) {
  const map = new Map<string, Islem[]>()
  for (const i of list) {
    const key = i.tarih.slice(0, 7)
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(i)
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, items]) => ({
      key,
      label: new Date(key + "-02").toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
      toplam: items.reduce((s, i) => s + i.tutar, 0),
      islemler: items,
    }))
}

const ODEME_DURUM_LABEL: Record<string, string> = {
  odendi: "Ödendi",
  kismi_odendi: "Kısmi",
  beklemede: "Beklemede",
  fazla_odeme: "Fazla Ödeme",
}
const ODEME_DURUM_VARIANT: Record<string, "success" | "warning" | "destructive"> = {
  odendi: "success",
  kismi_odendi: "warning",
  beklemede: "destructive",
  fazla_odeme: "warning",
}

function odemeDurumu(tutar: number, odenen: number): "odendi" | "kismi_odendi" | "beklemede" | "fazla_odeme" {
  if (odenen > tutar + 0.005) return "fazla_odeme"
  if (odenen >= tutar - 0.005) return "odendi"
  if (odenen > 0) return "kismi_odendi"
  return "beklemede"
}

export function Finans() {
  const { isAdmin, user } = useAuth()
  const [islemler, setIslemler] = useState<Islem[]>([])
  const [malzemeler, setMalzemeler] = useState<MalzemeWithFiyat[]>([])
  const [hesaplar, setHesaplar] = useState<Hesap[]>([])
  const [stokIslemIds, setStokIslemIds] = useState<Set<string>>(new Set())
  const [stokMaliyetMap, setStokMaliyetMap] = useState<Map<string, number>>(new Map())
  const [loading, setLoading] = useState(true)
  const [filterOdeme, setFilterOdeme] = useState<"tumu" | "odendi" | "kismi_odendi" | "beklemede">("tumu")
  const [filterGelirKat, setFilterGelirKat] = useState("tumu")
  const [filterGiderKat, setFilterGiderKat] = useState("tumu")
  const [filterDonem, setFilterDonem] = useState("tum")
  const [ozetFiltre, setOzetFiltre] = useState<"son6ay" | "tumzamanlar">("son6ay")
  const [islemDialogOpen, setIslemDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Islem | null>(null)
  const [copying, setCopying] = useState<Islem | null>(null)

  async function load() {
    setLoading(true)
    const islemQ = supabase.from("islemler").select("*").order("tarih", { ascending: false })
    if (!isAdmin) islemQ.eq("kullanici_id", user!.id)

    const [{ data: islemData }, { data: malzemeData }, { data: stokData }, { data: hesapData }] = await Promise.all([
      islemQ,
      supabase.from("malzemeler").select("*, kaynak_islem:islemler!kaynak_islem_id(tutar, nakliye_tutari)").order("ad"),
      supabase.from("islem_stok").select("islem_id, miktar, tur, birim_fiyat, malzeme:malzemeler!malzeme_id(miktar, kaynak_islem:islemler!kaynak_islem_id(tutar, nakliye_tutari))"),
      supabase.from("hesaplar").select("*").order("ad"),
    ])

    setIslemler((islemData ?? []) as Islem[])
    setMalzemeler((malzemeData ?? []) as MalzemeWithFiyat[])
    setHesaplar((hesapData ?? []) as Hesap[])

    const ids = new Set<string>()
    const mMap = new Map<string, number>()
    for (const s of (stokData ?? []) as any[]) {
      ids.add(s.islem_id)
      if (s.tur !== "cikis") continue
      const ki = s.malzeme?.kaynak_islem
      const birimFiyat = s.birim_fiyat > 0
        ? s.birim_fiyat
        : (ki && s.malzeme.miktar > 0
            ? (ki.tutar - (ki.nakliye_tutari ?? 0)) / s.malzeme.miktar
            : 0)
      mMap.set(s.islem_id, (mMap.get(s.islem_id) ?? 0) + s.miktar * birimFiyat)
    }
    setStokIslemIds(ids)
    setStokMaliyetMap(mMap)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openNew() { setEditing(null); setCopying(null); setIslemDialogOpen(true) }
  function openEdit(i: Islem) { setEditing(i); setCopying(null); setIslemDialogOpen(true) }
  function openCopy(i: Islem) { setEditing(null); setCopying(i); setIslemDialogOpen(true) }

  async function handleDelete(id: string) {
    if (!confirm("Bu işlemi silmek istediğinize emin misiniz?")) return
    await supabase.from("islemler").delete().eq("id", id)
    load()
  }

  function donemFiltrele(list: Islem[]): Islem[] {
    if (filterDonem === "tum") return list
    return list.filter(i => i.tarih.slice(0, 7) === filterDonem)
  }

  const mevcutAylar = Array.from(new Set(islemler.map(i => i.tarih.slice(0, 7))))
    .sort((a, b) => b.localeCompare(a))
    .map(key => ({
      key,
      label: new Date(key + "-02").toLocaleDateString("tr-TR", { month: "long", year: "numeric" }),
    }))

  const ayOzetleri = (() => {
    const map = new Map<string, { gelir: number; gider: number }>()
    for (const i of islemler) {
      const key = i.tarih.slice(0, 7)
      if (!map.has(key)) map.set(key, { gelir: 0, gider: 0 })
      const e = map.get(key)!
      if (i.tur === "gelir") e.gelir += i.tutar
      else e.gider += i.tutar
    }
    const rows = Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, v]) => ({
        key,
        label: new Date(key + "-02").toLocaleDateString("tr-TR", { month: "short", year: "numeric" }),
        gelir: v.gelir,
        gider: v.gider,
        net: v.gelir - v.gider,
      }))
    return ozetFiltre === "son6ay" ? rows.slice(0, 6) : rows
  })()

  const gelirlerTumu = islemler.filter(i => i.tur === "gelir")
  const giderlerTumu = islemler.filter(i => i.tur === "gider")

  const gelirKategoriler = [...new Set(gelirlerTumu.map(i => i.kategori))].sort()
  const giderKategoriler = [...new Set(giderlerTumu.map(i => i.kategori))].sort()

  const gelirler = donemFiltrele(gelirlerTumu).filter(i =>
    (filterOdeme === "tumu" || odemeDurumu(i.tutar, i.odenen_tutar) === filterOdeme) &&
    (filterGelirKat === "tumu" || i.kategori === filterGelirKat)
  )
  const giderler = donemFiltrele(giderlerTumu).filter(i =>
    (filterOdeme === "tumu" || odemeDurumu(i.tutar, i.odenen_tutar) === filterOdeme) &&
    (filterGiderKat === "tumu" || i.kategori === filterGiderKat)
  )

  const toplamGelir = islemler.filter(i => i.tur === "gelir").reduce((s, i) => s + i.tutar, 0)
  const toplamGider = islemler.filter(i => i.tur === "gider").reduce((s, i) => s + i.tutar, 0)
  const tahsilEdilecek = islemler
    .filter(i => i.tur === "gelir" && i.odenen_tutar < i.tutar)
    .reduce((s, i) => s + (i.tutar - i.odenen_tutar), 0)
  const odenecek = islemler
    .filter(i => i.tur === "gider" && i.odenen_tutar < i.tutar)
    .reduce((s, i) => s + (i.tutar - i.odenen_tutar), 0)

  function IslemSatir({ islem }: { islem: Islem }) {
    const kalan = islem.tutar - islem.odenen_tutar
    const durum = odemeDurumu(islem.tutar, islem.odenen_tutar)
    const hasStok = stokIslemIds.has(islem.id)
    const canEdit = isAdmin || islem.kullanici_id === user?.id
    const malzemeMaliyeti = islem.tur === "gelir" ? (stokMaliyetMap.get(islem.id) ?? 0) : 0
    const netKar = malzemeMaliyeti > 0 ? islem.tutar - malzemeMaliyeti : null
    return (
      <div className="py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-sm">{islem.aciklama}</p>
            {islem.faturali
              ? <FileCheck className="h-3.5 w-3.5 shrink-0 text-green-600" aria-label="Faturalı" />
              : <FileX className="h-3.5 w-3.5 shrink-0 text-orange-400" aria-label="Faturasız" />
            }
            <Badge variant={ODEME_DURUM_VARIANT[durum]} className="text-xs">
              {ODEME_DURUM_LABEL[durum]}
            </Badge>
            {hasStok && (
              <Badge variant="outline" className="text-xs gap-1">
                <Package className="h-2.5 w-2.5" /> Stok
              </Badge>
            )}
            {islem.transfer_eslesme_id && (
              <Badge variant="outline" className="text-xs gap-1 text-blue-500 border-blue-200">
                <ArrowLeftRight className="h-2.5 w-2.5" /> Transfer
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {formatDate(islem.tarih)} · {islem.kategori}
            {islem.vade_tarihi && ` · Vade: ${formatDate(islem.vade_tarihi)}`}
          </p>
          {durum === "kismi_odendi" && (
            <p className="text-xs text-orange-500 mt-0.5">
              Ödenen: {formatCurrency(islem.odenen_tutar)} · Kalan: {formatCurrency(kalan)}
            </p>
          )}
          {durum === "beklemede" && (
            <p className="text-xs text-orange-500 mt-0.5">Henüz ödenmedi</p>
          )}
          {durum === "fazla_odeme" && (
            <p className="text-xs text-red-500 mt-0.5 font-medium">
              Fazla Ödeme: {formatCurrency(-kalan)}
            </p>
          )}
          {netKar !== null && (
            <p className="text-xs mt-0.5">
              <span className="text-muted-foreground">Maliyet: {formatCurrency(malzemeMaliyeti)}</span>
              <span className={`ml-2 font-medium ${netKar >= 0 ? "text-green-600" : "text-red-500"}`}>
                Net Kâr: {netKar >= 0 ? "+" : ""}{formatCurrency(netKar)}
              </span>
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
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" title="Kopyala" onClick={() => openCopy(islem)}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
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
  }

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

      {/* Aylık özet tablo */}
      {!loading && ayOzetleri.length > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b border-border">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Aylık Özet</CardTitle>
              <div className="flex rounded-md border border-border overflow-hidden text-xs">
                <button
                  onClick={() => setOzetFiltre("son6ay")}
                  className={`px-3 py-1.5 transition-colors ${ozetFiltre === "son6ay" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                >
                  Son 6 Ay
                </button>
                <button
                  onClick={() => setOzetFiltre("tumzamanlar")}
                  className={`px-3 py-1.5 transition-colors border-l border-border ${ozetFiltre === "tumzamanlar" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"}`}
                >
                  Tüm Zamanlar
                </button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0 px-0 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left font-medium px-4 py-2">Ay</th>
                  <th className="text-right font-medium px-3 py-2">Gelir</th>
                  <th className="text-right font-medium px-3 py-2">Gider</th>
                  <th className="text-right font-medium px-4 py-2">Net</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ayOzetleri.map(row => (
                  <tr key={row.key} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2 capitalize whitespace-nowrap">{row.label}</td>
                    <td className="px-3 py-2 text-right text-green-600 font-medium whitespace-nowrap">{formatCurrency(row.gelir)}</td>
                    <td className="px-3 py-2 text-right text-red-500 font-medium whitespace-nowrap">{formatCurrency(row.gider)}</td>
                    <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${row.net >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {row.net >= 0 ? "+" : ""}{formatCurrency(row.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/30 font-semibold">
                  <td className="px-4 py-2">Toplam</td>
                  <td className="px-3 py-2 text-right text-green-600 whitespace-nowrap">{formatCurrency(ayOzetleri.reduce((s, r) => s + r.gelir, 0))}</td>
                  <td className="px-3 py-2 text-right text-red-500 whitespace-nowrap">{formatCurrency(ayOzetleri.reduce((s, r) => s + r.gider, 0))}</td>
                  <td className={`px-4 py-2 text-right whitespace-nowrap ${ayOzetleri.reduce((s, r) => s + r.net, 0) >= 0 ? "text-green-600" : "text-red-500"}`}>
                    {(() => { const n = ayOzetleri.reduce((s, r) => s + r.net, 0); return (n >= 0 ? "+" : "") + formatCurrency(n) })()}
                  </td>
                </tr>
              </tfoot>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Filtreler */}
      <div className="flex justify-end gap-2 flex-wrap">
        <Select value={filterDonem} onValueChange={setFilterDonem}>
          <SelectTrigger className="h-8 w-44 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tum">Tüm Zamanlar</SelectItem>
            {mevcutAylar.map(({ key, label }) => (
              <SelectItem key={key} value={key} className="capitalize">{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterOdeme} onValueChange={v => setFilterOdeme(v as typeof filterOdeme)}>
          <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="tumu">Tüm Ödemeler</SelectItem>
            <SelectItem value="odendi">Ödendi</SelectItem>
            <SelectItem value="kismi_odendi">Kısmi Ödendi</SelectItem>
            <SelectItem value="beklemede">Beklemede</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Gelir */}
          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-green-600">Gelir</CardTitle>
                <span className="text-base font-bold text-green-600">{formatCurrency(toplamGelir)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">{gelirler.length} kayıt</p>
                {gelirKategoriler.length > 1 && (
                  <Select value={filterGelirKat} onValueChange={setFilterGelirKat}>
                    <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tumu">Tüm Tipler</SelectItem>
                      {gelirKategoriler.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 px-0">
              {gelirler.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-sm">Gelir kaydı yok</p>
              ) : (
                ayGrupla(gelirler).map(grup => (
                  <div key={grup.key}>
                    <div className="flex items-center justify-between px-6 py-2 bg-muted/50 border-b border-border">
                      <span className="text-xs font-semibold text-muted-foreground capitalize">{grup.label}</span>
                      <span className="text-xs font-bold text-green-600">{formatCurrency(grup.toplam)}</span>
                    </div>
                    <div className="divide-y divide-border px-6">
                      {grup.islemler.map(i => <IslemSatir key={i.id} islem={i} />)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* Gider */}
          <Card>
            <CardHeader className="pb-3 border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-red-500">Gider</CardTitle>
                <span className="text-base font-bold text-red-500">{formatCurrency(toplamGider)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground">{giderler.length} kayıt</p>
                {giderKategoriler.length > 1 && (
                  <Select value={filterGiderKat} onValueChange={setFilterGiderKat}>
                    <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tumu">Tüm Tipler</SelectItem>
                      {giderKategoriler.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0 px-0">
              {giderler.length === 0 ? (
                <p className="text-center text-muted-foreground py-10 text-sm">Gider kaydı yok</p>
              ) : (
                ayGrupla(giderler).map(grup => (
                  <div key={grup.key}>
                    <div className="flex items-center justify-between px-6 py-2 bg-muted/50 border-b border-border">
                      <span className="text-xs font-semibold text-muted-foreground capitalize">{grup.label}</span>
                      <span className="text-xs font-bold text-red-500">{formatCurrency(grup.toplam)}</span>
                    </div>
                    <div className="divide-y divide-border px-6">
                      {grup.islemler.map(i => <IslemSatir key={i.id} islem={i} />)}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

        </div>
      )}

      <IslemDialog
        open={islemDialogOpen}
        onClose={() => { setIslemDialogOpen(false); setCopying(null) }}
        editing={editing}
        initialValues={copying ?? undefined}
        malzemeler={malzemeler}
        hesaplar={hesaplar}
        onSaved={load}
      />
    </div>
  )
}
