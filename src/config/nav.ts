import { LayoutDashboard, Search, Sparkles, Users, Mail, FileText, KanbanSquare, BarChart3, Bot, Settings } from "lucide-react";
export const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/jobs", label: "Discover Jobs", icon: Search },
  { href: "/recommended", label: "Recommended Jobs", icon: Sparkles },
  { href: "/hr-contacts", label: "HR Contacts", icon: Users },
  { href: "/outreach", label: "Email Outreach", icon: Mail },
  { href: "/resume", label: "Resume Manager", icon: FileText },
  { href: "/applications", label: "Applications", icon: KanbanSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/assistant", label: "AI Assistant", icon: Bot },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;
