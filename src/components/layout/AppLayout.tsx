import { Outlet } from "react-router-dom"
import { Sidebar } from "./Sidebar"

export function AppLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto sm:p-6 p-4 pt-16 sm:pt-6">
        <Outlet />
      </main>
    </div>
  )
}
