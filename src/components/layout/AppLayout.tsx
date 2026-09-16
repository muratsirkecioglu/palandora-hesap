import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"
import { useSirket } from "@/contexts/SirketContext"

export function AppLayout() {
  const { loading, aktifSirketId } = useSirket()

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto sm:p-6 p-4 pt-16 sm:pt-6">
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">Yükleniyor...</div>
        ) : !aktifSirketId ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground text-sm text-center">
            Hiçbir şirkete üye değilsiniz. Lütfen yöneticinizle iletişime geçin.
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  )
}
