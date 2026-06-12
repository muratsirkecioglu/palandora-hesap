import { NavLink, useNavigate } from "react-router-dom"
import {
  LayoutDashboard,
  TrendingUp,
  Package,
  Users,
  LogOut,
  Building2,
  Menu,
  X,
  Landmark,
} from "lucide-react"
import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Panel" },
  { to: "/finans", icon: TrendingUp, label: "Finans" },
  { to: "/hesaplar", icon: Landmark, label: "Hesaplar" },
  { to: "/stok", icon: Package, label: "Stok" },
  { to: "/demirbaslar", icon: Building2, label: "Demirbaşlar" },
]

const adminItems = [
  { to: "/kullanicilar", icon: Users, label: "Kullanıcılar" },
]

export function Sidebar() {
  const { appUser, signOut, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    navigate("/giris")
  }

  const NavItems = () => (
    <>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Building2 className="h-6 w-6 text-primary" />
        <span className="font-semibold text-sm">Palandora</span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )
            }
            onClick={() => setMobileOpen(false)}
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Yönetim</p>
            </div>
            {adminItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )
                }
                onClick={() => setMobileOpen(false)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-border p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">
              {appUser?.ad_soyad?.charAt(0) ?? "?"}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{appUser?.ad_soyad}</p>
            <p className="text-xs text-muted-foreground">
              {appUser?.rol === "admin" ? "Yönetici" : "Çalışan"}
            </p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground" onClick={handleSignOut}>
          <LogOut className="h-4 w-4" />
          Çıkış Yap
        </Button>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4 py-3 bg-background border-b border-border">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Palandora</span>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div className={cn(
        "md:hidden fixed top-0 left-0 bottom-0 z-40 w-64 bg-background border-r border-border flex flex-col transition-transform",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <NavItems />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 border-r border-border bg-background flex-col flex-shrink-0 h-screen sticky top-0">
        <NavItems />
      </div>
    </>
  )
}
