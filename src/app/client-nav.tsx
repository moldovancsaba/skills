'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { useTheme } from "@/lib/theme-provider";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, Sun, Moon } from "lucide-react";

export function ClientNav() {
  const router = useRouter();
  const { company } = useStore();
  const { isDark, toggle } = useTheme();

  const handleSwitchCompany = () => {
    router.push("/");
  };

  if (!company) return null;

  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto max-w-7xl px-4">
        <div className="flex min-h-14 items-center justify-between gap-3">
          <Link href={`/${company.id}`} className="font-bold text-foreground">
            Checklist
          </Link>

          <div className="flex flex-wrap items-center gap-1">
            <Link href={`/${company.id}`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Dashboard
            </Link>
            <Link href={`/${company.id}/data`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Data
            </Link>
            <Link href={`/${company.id}/nba`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Tasks
            </Link>
            <Link href={`/${company.id}/knowmore`} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
              Knowmore
            </Link>

            <Button
              onClick={toggle}
              variant="ghost"
              size="icon"
              title={isDark ? "Light mode" : "Dark mode"}
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>

          <Button onClick={handleSwitchCompany} variant="secondary" size="sm">
            <span>{company.name}</span>
            <ChevronDown className="w-3 h-3" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
