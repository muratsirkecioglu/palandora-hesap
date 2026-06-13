import { useEffect, useState } from "react"
import { TrendingUp, TrendingDown, AlertTriangle, Wallet } from "lucide-react"
import { supabase, type Islem } from "@/lib/supabase"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatCurrency, formatDate } from "@/lib/utils"
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts"

interface SummaryStats {
  toplamGelir: number
  toplamGider: number
  bakiye: number
  kritikStok: number
}

export function Dashboard() {
  const { isAdmin, user } = useAuth()
  const [stats, setStats] = useState<SummaryStats>({ toplamGelir: 0, toplamGider: 0, bakiye: 0, kritikStok: 0 })
  const [sonIslemler, setSonIslemler] = useState<Islem[]>([])
  const [chartData, setChartData] = useState<{ ay: string; gelir: number; gider: number }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const islemQuery = supabase.from("islemler").select("*").order("tarih", { ascending: false })
      if (!isAdmin) islemQuery.eq("kullanici_id", user!.id)

      const malzemeQuery = supabase.from("malzemeler").select("id, min_miktar")
      const stokQuery = supabase.from("islem_stok").select("malzeme_id, miktar, tur")

      const [{ data: islemler }, { data: malzemeler }, { data: stokData }] = await Promise.all([
        islemQuery,
        malzemeQuery,
        stokQuery,
      ])

      const list = (islemler ?? []) as Islem[]
      const mList = (malzemeler ?? []) as { id: string; min_miktar: number }[]

      const toplamGelir = list.filter(i => i.tur === "gelir").reduce((s, i) => s + i.tutar, 0)
      const toplamGider = list.filter(i => i.tur === "gider").reduce((s, i) => s + i.tutar, 0)

      // Dinamik stok hesaplama
      const stokMap = new Map<string, number>()
      for (const s of (stokData ?? []) as { malzeme_id: string; miktar: number; tur: string }[]) {
        const curr = stokMap.get(s.malzeme_id) ?? 0
        stokMap.set(s.malzeme_id, curr + (s.tur === "giris" ? s.miktar : -s.miktar))
      }
      const kritikStok = mList.filter(m => m.min_miktar > 0 && (stokMap.get(m.id) ?? 0) <= m.min_miktar).length

      setStats({ toplamGelir, toplamGider, bakiye: toplamGelir - toplamGider, kritikStok })
      setSonIslemler(list.slice(0, 5))

      // Son 6 ay chart verisi
      const aylar: Record<string, { gelir: number; gider: number }> = {}
      const now = new Date()
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        aylar[key] = { gelir: 0, gider: 0 }
      }
      list.forEach(islem => {
        const key = islem.tarih.slice(0, 7)
        if (aylar[key]) {
          if (islem.tur === "gelir") aylar[key].gelir += islem.tutar
          else aylar[key].gider += islem.tutar
        }
      })
      const ayNames = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
      setChartData(Object.entries(aylar).map(([key, val]) => ({
        ay: ayNames[parseInt(key.split("-")[1]) - 1],
        ...val,
      })))

      setLoading(false)
    }
    load()
  }, [isAdmin, user])

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Yükleniyor...</div>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Panel</h1>
        <p className="text-muted-foreground text-sm">Genel özet</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Toplam Gelir" value={formatCurrency(stats.toplamGelir)} icon={TrendingUp} color="text-green-600" bg="bg-green-50" />
        <StatCard title="Toplam Gider" value={formatCurrency(stats.toplamGider)} icon={TrendingDown} color="text-red-500" bg="bg-red-50" />
        <StatCard title="Net Bakiye" value={formatCurrency(stats.bakiye)} icon={Wallet} color="text-blue-600" bg="bg-blue-50" />
        <StatCard title="Kritik Stok" value={`${stats.kritikStok} kalem`} icon={AlertTriangle} color="text-orange-500" bg="bg-orange-50" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Aylık Gelir / Gider</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="ay" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={v => `₺${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Area type="monotone" dataKey="gelir" stroke="#22c55e" fill="#dcfce7" name="Gelir" />
                <Area type="monotone" dataKey="gider" stroke="#ef4444" fill="#fee2e2" name="Gider" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Son İşlemler</CardTitle>
          </CardHeader>
          <CardContent>
            {sonIslemler.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Henüz işlem yok</p>
            ) : (
              <div className="space-y-3">
                {sonIslemler.map(islem => (
                  <div key={islem.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium">{islem.aciklama}</p>
                      <p className="text-muted-foreground text-xs">{formatDate(islem.tarih)} · {islem.kategori}</p>
                    </div>
                    <span className={islem.tur === "gelir" ? "text-green-600 font-semibold" : "text-red-500 font-semibold"}>
                      {islem.tur === "gelir" ? "+" : "-"}{formatCurrency(islem.tutar)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon: Icon, color, bg }: {
  title: string; value: string; icon: React.ElementType; color: string; bg: string
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs text-muted-foreground font-medium">{title}</p>
          <div className={`h-8 w-8 rounded-lg ${bg} flex items-center justify-center`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  )
}
