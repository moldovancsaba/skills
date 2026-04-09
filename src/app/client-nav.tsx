'use client';

import Image from "next/image";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, Sun, Moon, LogOut, User } from "lucide-react";

export function ClientNav() {
  const router = useRouter();
  const { company } = useStore();
  const { isDark, toggle } = useTheme();
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setSession(data));
  }, []);

  const handleSwitchCompany = () => {
    router.push("/");
  };

  const handleLogout = () => {
    window.location.href = "/api/auth/logout?returnTo=/login";
  };

  return (
    <nav className="sticky top-0 z-40 border-b border-border/80 bg-background/85 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 md:px-6">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <Link href="/" className="font-display text-lg font-bold text-foreground">
            Checklist
          </Link>

          <div className="flex-1 flex items-center justify-center gap-1">
            {company && (
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border/80 bg-card/80 p-1 shadow-card">
                <Link href={`/${company.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                  Dashboard
                </Link>
                <Link href={`/${company.id}/data`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                  Data
                </Link>
                <Link href={`/${company.id}/topics`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                  Topics
                </Link>
                <Link href={`/${company.id}/nba`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                  Checklist
                </Link>
                <Link href={`/${company.id}/knowmore`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                  Knowmore
                </Link>
              </div>
            )}
            
            <div className="flex items-center gap-1 ml-4">
              <Link href="/manual" className={cn(buttonVariants({ variant: "ghost", size: "sm" })) + " transition-colors"}>
                Manual
              </Link>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={toggle}
              variant="ghost"
              size="icon"
              title={isDark ? "Light mode" : "Dark mode"}
              className="rounded-full"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            {company && (
              <Button onClick={handleSwitchCompany} variant="secondary" size="sm" className="hidden md:flex min-w-[10rem] justify-between">
                <span>{company.name}</span>
                <ChevronDown className="w-3 h-3" />
              </Button>
            )}

            {session && (
              <div className="flex items-center gap-2 pl-3 border-l border-border/50">
                <div className="text-right">
                  <p className="text-xs font-semibold leading-none">{session.name}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 lowercase">{session.email}</p>
                </div>
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  {session.picture ? (
                    <Image
                      src={session.picture}
                      alt={session.name}
                      width={32}
                      height={32}
                      className="w-full h-full rounded-full"
                      unoptimized
                    />
                  ) : (
                    <User className="w-4 h-4 text-primary" />
                  )}
                </div>
                <Button 
                  onClick={handleLogout}
                  variant="ghost" 
                  size="icon" 
                  className="text-muted-foreground hover:text-destructive"
                  title="Logout"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
