"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Moon, Sun, LogOut, Briefcase } from "lucide-react";
import { useTheme } from "next-themes";
import { NAV } from "@/config/nav";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

function NavList({ onNav }: { onNav?: () => void }) {
  const path = usePathname();
  return (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = path === href || (href !== "/dashboard" && path.startsWith(href));
        return (
          <Link key={href} href={href} onClick={onNav}
            className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors", active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children, email, signOutAction }: { children: React.ReactNode; email: string; signOutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 border-r bg-card md:block">
        <div className="flex h-14 items-center gap-2 border-b px-4 font-semibold"><Briefcase className="size-5" /> AI Job Hunter</div>
        <NavList />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <SheetTitle className="flex h-14 items-center gap-2 border-b px-4 font-semibold"><Briefcase className="size-5" /> AI Job Hunter</SheetTitle>
          <NavList onNav={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu className="size-5" /></Button>
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
            <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              <Sun className="size-4 dark:hidden" /><Moon className="hidden size-4 dark:block" />
            </Button>
            <form action={signOutAction}><Button variant="ghost" size="icon" aria-label="Sign out" type="submit"><LogOut className="size-4" /></Button></form>
          </div>
        </header>
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
