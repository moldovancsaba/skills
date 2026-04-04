'use client';

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { motion } from "framer-motion";
import { Plus, Users, Search, BarChart3 } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCompany, setProducts, setCustomers, setCompetitors } = useStore();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Check for company in URL first
  const companyParam = searchParams.get("company");

  useEffect(() => {
    fetch("/api/companies")
      .then(res => res.json())
      .then(data => {
        setCompanies(data);
        setLoading(false);
        
        // If company in URL, select it
        if (companyParam) {
          const found = data.find((c: any) => c.id === companyParam);
          if (found) {
            selectCompany(found);
          }
        }
      })
      .catch(console.error);
  }, [companyParam]);

  const selectCompany = async (company: any) => {
    setCompany(company);
    setProducts([]);
    setCustomers([]);
    setCompetitors([]);
    fetch(`/api/products?companyId=${company.id}`).then(r => r.json()).then(setProducts);
    fetch(`/api/customers?companyId=${company.id}`).then(r => r.json()).then(setCustomers);
    fetch(`/api/competitors?companyId=${company.id}`).then(r => r.json()).then(setCompetitors);
    router.push(`/dashboard?company=${company.id}`);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Select Company</h1>
        <p className="text-sm text-muted-foreground mt-1">Choose which company to work with.</p>
      </motion.div>

      {companies.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No companies yet.</p>
          <Link href="/dashboard" className="bg-primary text-primary-foreground px-4 py-2 rounded-md">
            Create First Company
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {companies.map((c: any) => (
            <button
              key={c.id}
              onClick={() => selectCompany(c)}
              className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:bg-muted transition-colors text-left"
            >
              <div>
                <p className="font-medium text-foreground">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.industry || "No industry"}</p>
              </div>
              <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                /d/{c.id.slice(0,8)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="pt-4 border-t border-border">
        <Link href="/dashboard" className="text-sm text-primary hover:underline">
          + Add new company
        </Link>
      </div>
    </div>
  );
}