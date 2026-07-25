"use client"

import { cn } from "@/lib/utils"
import { 
  LayoutDashboard, 
  FolderOpen, 
  BarChart3, 
  Settings,
  ClipboardList,
  Brain
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

const navItems = [
  { id: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "/subjects", icon: FolderOpen, label: "Subjects" },
  { id: "/quiz", icon: ClipboardList, label: "Quizzes" },
  { id: "/analytics", icon: BarChart3, label: "Analytics" },
  { id: "/settings", icon: Settings, label: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-16 lg:w-64 bg-card border-r border-border flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 border-b border-border">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Brain className="w-6 h-6 text-primary" />
          </div>
          <span className="text-lg font-semibold text-foreground hidden lg:block">EduSync</span>
        </Link>
      </div>

      {/* Main navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.id)
          return (
            <Link
              key={item.id}
              href={item.id}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                isActive
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              <span className="hidden lg:block text-sm font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
