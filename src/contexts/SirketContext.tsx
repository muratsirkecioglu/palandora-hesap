import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import { supabase, type Sirket } from "@/lib/supabase"
import { useAuth } from "./AuthContext"

interface SirketContextValue {
  sirketler: Sirket[]
  aktifSirketId: string | null
  aktifSirket: Sirket | null
  setAktifSirketId: (id: string) => void
  loading: boolean
  yenile: () => Promise<void>
}

const SirketContext = createContext<SirketContextValue | null>(null)

const STORAGE_KEY = "palandora.aktifSirketId"

export function SirketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [sirketler, setSirketler] = useState<Sirket[]>([])
  const [aktifSirketId, setAktifSirketIdState] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  function setAktifSirketId(id: string) {
    setAktifSirketIdState(id)
    try { localStorage.setItem(STORAGE_KEY, id) } catch { /* özel pencere vb. */ }
  }

  async function yenile() {
    if (!user) { setSirketler([]); setAktifSirketIdState(null); setLoading(false); return }
    setLoading(true)
    // RLS gereği burada zaten yalnızca üye olunan şirketler döner.
    const { data } = await supabase.from("sirketler").select("*").eq("aktif", true).order("ad")
    const list = (data ?? []) as Sirket[]
    setSirketler(list)

    let kayitli: string | null = null
    try { kayitli = localStorage.getItem(STORAGE_KEY) } catch { /* yoksay */ }
    const gecerli = kayitli && list.some(s => s.id === kayitli) ? kayitli : (list[0]?.id ?? null)
    setAktifSirketIdState(gecerli)
    if (gecerli && gecerli !== kayitli) {
      try { localStorage.setItem(STORAGE_KEY, gecerli) } catch { /* yoksay */ }
    }
    setLoading(false)
  }

  useEffect(() => { yenile() }, [user?.id])

  return (
    <SirketContext.Provider value={{
      sirketler,
      aktifSirketId,
      aktifSirket: sirketler.find(s => s.id === aktifSirketId) ?? null,
      setAktifSirketId,
      loading,
      yenile,
    }}>
      {children}
    </SirketContext.Provider>
  )
}

export function useSirket() {
  const ctx = useContext(SirketContext)
  if (!ctx) throw new Error("useSirket must be used within SirketProvider")
  return ctx
}
