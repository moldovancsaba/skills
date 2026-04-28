'use client';

import Image from "next/image";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, Sun, Moon, LogOut, User, Menu, Settings as SettingsIcon } from "lucide-react";

const pipelineItems = [
  {
    key: "data",
    href: (companyId: string) => `/${companyId}/data`,
    label: "Data",
    icon: "looks_one",
    colorClass: "pipeline-data",
  },
  {
    key: "topics",
    href: (companyId: string) => `/${companyId}/topics`,
    label: "Topics",
    icon: "looks_two",
    colorClass: "pipeline-topics",
  },
  {
    key: "review",
    href: (companyId: string) => `/${companyId}/review`,
    label: "Review",
    icon: "rule",
    colorClass: "text-amber-500", // Visual distinction for human review
  },
  {
    key: "knowmore",
    href: (companyId: string) => `/${companyId}/knowmore`,
    label: "Knowmore",
    icon: "looks_3",
    colorClass: "pipeline-knowmore",
  },
  {
    key: "checklist",
    href: (companyId: string) => `/${companyId}/nba`,
    label: "checklist",
    icon: "looks_4",
    colorClass: "pipeline-checklist",
  },
];

const bottomItems = [
  {
    key: "settings",
    href: (companyId: string) => `/${companyId}/settings`,
    label: "Settings",
    colorClass: "text-muted-foreground",
  },
];

export function ClientNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { company } = useStore();
  const { isDark, toggle } = useTheme();
  const [session, setSession] = useState<any>(null);
  const [companyCount, setCompanyCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSession(data));

    fetch("/api/companies")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setCompanyCount(Array.isArray(data) ? data.length : 0))
      .catch(() => setCompanyCount(0));
  }, []);

  const handleSwitchCompany = () => {
    router.push("/");
  };

  const handleLogout = () => {
    window.location.href = "/api/auth/logout?returnTo=/login";
  };

  if (pathname === "/login" || pathname === "/auth" || pathname?.startsWith("/auth/")) {
    return null;
  }

  return (
    <aside className={cn(
      "relative shrink-0 border-r border-border/80 bg-background/85 backdrop-blur z-40 flex flex-col transition-all duration-300",
      isCollapsed ? "w-16" : "w-64"
    )}>
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border/50 shrink-0">
        {!isCollapsed && (
          <Link href="/" className="font-display text-lg font-bold text-foreground truncate">
            checklist
          </Link>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          className={cn("h-8 w-8", isCollapsed && "mx-auto")}
          onClick={() => setIsCollapsed(!isCollapsed)}
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </div>

      {/* Main Nav */}
      <div className="flex-1 overflow-y-auto py-6 px-3 space-y-6">
        {company && (
          <div className="space-y-2">
            {/* Company Switcher */}
             <div className="mb-6 px-1">
              {companyCount > 1 ? (
                <Button 
                  onClick={handleSwitchCompany} 
                  variant="outline" 
                  size="sm" 
                  className={cn("w-full justify-start overflow-hidden border-border/50 shadow-sm", isCollapsed && "px-0 justify-center border-transparent shadow-none")}
                  title={company.name}
                >
                  {isCollapsed ? (
                    <span className="font-bold text-xs uppercase tracking-widest">{company.name.slice(0, 2)}</span>
                  ) : (
                    <>
                      <span className="truncate flex-1 text-left font-semibold">{company.name}</span>
                      <ChevronDown className="w-3 h-3 ml-2 shrink-0 opacity-50" />
                    </>
                  )}
                </Button>
              ) : (
                 <div className="px-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest truncate text-center">
                   {isCollapsed ? company.name.slice(0, 2) : company.name}
                 </div>
              )}
            </div>

            {/* Dashboard Link - Now with requested space_dashboard icon */}
            <Link
              href={`/${company.id}`}
              className={cn(
                buttonVariants({ variant: pathname === `/${company.id}` ? "secondary" : "ghost", size: "sm" }),
                "w-full justify-start gap-4 h-10",
                isCollapsed && "justify-center px-0 hover:bg-zinc-800/50"
              )}
              title="Dashboard"
            >
              <span className="material-symbols-outlined text-[22px] text-zinc-400 shrink-0" aria-hidden="true">space_dashboard</span>
              {!isCollapsed && <span className="font-medium">Dashboard</span>}
            </Link>

            {/* Pipeline Links */}
            {pipelineItems.map((item) => {
              const isActive = pathname.includes(item.key);
              return (
                <Link
                  key={item.key}
                  href={item.href(company.id)}
                  className={cn(
                    buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "sm" }),
                    "w-full justify-start gap-4 h-10 relative group",
                    isCollapsed && "justify-center px-0 hover:bg-zinc-800/50"
                  )}
                  title={item.label}
                >
                  {isActive && !isCollapsed && (
                     <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-foreground rounded-r-md" />
                  )}
                  <span className={cn("material-symbols-outlined text-[22px] shrink-0", item.colorClass, isActive && "scale-110 transition-transform")} aria-hidden="true">
                    {item.icon}
                  </span>
                  {!isCollapsed && <span className={cn("font-medium transition-colors", isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{item.label}</span>}
                </Link>
              );
            })}

            {/* Settings - always at bottom of nav section */}
            {bottomItems.map((item) => {
              const isActive = pathname.includes(item.key);
              return (
                <Link
                  key={item.key}
                  href={item.href(company.id)}
                  className={cn(
                    buttonVariants({ variant: isActive ? "secondary" : "ghost", size: "sm" }),
                    "w-full justify-start gap-4 h-10 mt-2 relative group",
                    isCollapsed && "justify-center px-0 hover:bg-zinc-800/50"
                  )}
                  title={item.label}
                >
                  {isActive && !isCollapsed && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-foreground rounded-r-md" />
                  )}
                  <SettingsIcon className={cn("h-[22px] w-[22px] shrink-0", item.colorClass, isActive && "text-foreground")} />
                  {!isCollapsed && <span className={cn("font-medium transition-colors", isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{item.label}</span>}
                </Link>
              );
            })}

            {/* Superadmin: trinity */}
            {session?.isSuperAdmin && (
              <Link
                href="/intelligence"
                className={cn(
                  buttonVariants({ variant: pathname === "/intelligence" ? "secondary" : "ghost", size: "sm" }),
                  "w-full justify-start gap-4 h-10 mt-2 relative group text-accent hover:text-accent",
                  isCollapsed && "justify-center px-0 hover:bg-accent/10"
                )}
                title="trinity"
              >
                {pathname === "/intelligence" && !isCollapsed && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-accent rounded-r-md" />
                )}
                <span className="material-symbols-outlined text-[22px] shrink-0" aria-hidden="true">terminal</span>
                {!isCollapsed && <span className="font-bold tracking-tight">trinity</span>}
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Footer Nav */}
      <div className="p-3 border-t border-border/50 shrink-0 space-y-3 bg-zinc-950/20">
         {/* Theme Toggle */}
         <Button
            onClick={toggle}
            variant="ghost"
            size="sm"
            className={cn("w-full justify-start gap-4 h-10", isCollapsed && "justify-center px-0 hover:bg-zinc-800/50")}
            title={isDark ? "Light mode" : "Dark mode"}
          >
            {isDark ? <Sun className="w-4 h-4 shrink-0 text-amber-500" /> : <Moon className="w-4 h-4 shrink-0 text-indigo-400" />}
            {!isCollapsed && <span className="font-medium text-muted-foreground">Theme</span>}
          </Button>
          
          {/* User Profile */}
          {session && (
            <div className={cn("flex flex-wrap items-center mt-2", isCollapsed ? "justify-center gap-3" : "gap-3 px-2")}>
              <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center border border-border/50 shadow-sm overflow-hidden">
                {session.picture ? (
                  <Image
                    src={session.picture}
                    alt={session.name}
                    width={36}
                    height={36}
                    className="w-full h-full object-cover"
                    unoptimized
                  />
                ) : (
                  <User className="w-4 h-4 text-primary" />
                )}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-none truncate">{session.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 lowercase truncate">{session.email}</p>
                </div>
              )}
              <Button 
                onClick={handleLogout}
                variant="ghost" 
                size="icon" 
                className={cn("text-muted-foreground hover:text-destructive shrink-0", isCollapsed ? "w-full mt-2" : "h-8 w-8")}
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </div>
          )}
      </div>
    </aside>
  );
}
