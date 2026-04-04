'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { ChevronDown, Plus, Users, Target, CheckSquare } from "lucide-react";

export function ClientNav() {
  const router = useRouter();
  const { company, setCompany } = useStore();
  const [showMenu, setShowMenu] = useState(false);

  const handleSwitchCompany = () => {
    setShowMenu(false);
    router.push("/");
  };

  if (!company) return null;

  return (
    <nav className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          <Link href={`/${company.id}`} className="font-bold">
            Checklist
          </Link>

          <div className="flex items-center gap-1">
            <Link href={`/${company.id}`} className="px-3 py-1.5 text-sm hover:bg-muted rounded-md">
              Dashboard
            </Link>
            <Link href={`/${company.id}/data`} className="px-3 py-1.5 text-sm hover:bg-muted rounded-md">
              Data
            </Link>
            <Link href={`/${company.id}/nba`} className="px-3 py-1.5 text-sm hover:bg-muted rounded-md">
              Tasks
            </Link>
          </div>

          <button onClick={handleSwitchCompany} className="flex items-center gap-2 px-3 py-1.5 text-sm bg-muted rounded-md">
            <span>{company.name}</span>
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>
      </div>
    </nav>
  );
}