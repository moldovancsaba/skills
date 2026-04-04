'use client';

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { 
  LayoutDashboard, Plus, LogOut, ChevronDown, 
  Brain, Target, BarChart3, Users, Package, 
  Search, Bell, FileText, Settings
} from "lucide-react";

export function ClientNav() {
  const router = useRouter();
  const { company, setCompany, products, setProducts, customers, setCustomers, competitors, setCompetitors } = useStore();
  const [companies, setCompanies] = useState<any[]>([]);
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    fetch("/api/companies")
      .then(res => res.json())
      .then(data => {
        setCompanies(data);
        if (data.length > 0 && !company) {
          setCompany(data[0]);
        }
      })
      .catch(console.error);
  }, []);

  const switchClient = async (companyId: string) => {
    const selected = companies.find(c => c.id === companyId);
    if (selected) {
      setCompany(selected);
      setShowMenu(false);
      setProducts([]);
      setCustomers([]);
      setCompetitors([]);
      setNbaItems([]);
      fetch(`/api/products?companyId=${companyId}`).then(r => r.json()).then(setProducts);
      fetch(`/api/customers?companyId=${companyId}`).then(r => r.json()).then(setCustomers);
      fetch(`/api/competitors?companyId=${companyId}`).then(r => r.json()).then(setCompetitors);
      router.push("/dashboard");
    }
  };

  const handleLogout = () => {
    setCompany(null);
    setShowMenu(false);
    router.push("/");
  };

  const setNbaItems = (items: any) => {};

  if (!company) return null;

  const navItems = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
    { name: "Data", path: "/data", icon: Plus },
    { name: "Strategy", path: "/strategy", icon: Brain },
    { name: "Intelligence", path: "/intelligence", icon: Target },
    { name: "CRM", path: "/crm", icon: Users },
  ];

  return (
    <nav className="bg-card border-b border-border">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-12">
          {/* Logo */}
          <Link href="/dashboard" className="flex items-center gap-2">
            <span className="font-bold text-lg">Checklist</span>
          </Link>

          {/* Nav Links */}
          <div className="flex items-center gap-1">
            {navItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md hover:bg-muted"
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Company Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-muted rounded-md hover:bg-muted/80"
            >
              <span>{company.name}</span>
              <ChevronDown className="w-3 h-3" />
            </button>

            {showMenu && (
              <div className="absolute right-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg z-50">
                {companies.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => switchClient(c.id)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted ${
                      company?.id === c.id ? "bg-muted font-medium" : ""
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
                <div className="border-t border-border my-1" />
                <button
                  onClick={handleLogout}
                  className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-muted flex items-center gap-2"
                >
                  <LogOut className="w-3 h-3" />
                  Switch Company / Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}