'use client';

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { motion } from "framer-motion";
import { Plus, LogOut, ChevronRight } from "lucide-react";

export default function Home() {
  const router = useRouter();
  const { company, setCompany, setProducts, setCustomers, setCompetitors } = useStore();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/companies")
      .then(res => res.json())
      .then(data => {
        setCompanies(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  const handleSelectCompany = async (companyId: string) => {
    const selected = companies.find(c => c.id === companyId);
    if (selected) {
      setCompany(selected);
      setProducts([]);
      setCustomers([]);
      setCompetitors([]);
      fetch(`/api/products?companyId=${companyId}`).then(r => r.json()).then(setProducts);
      fetch(`/api/customers?companyId=${companyId}`).then(r => r.json()).then(setCustomers);
      fetch(`/api/competitors?companyId=${companyId}`).then(r => r.json()).then(setCompetitors);
      router.push("/dashboard");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading...</p>
      </div>
    );
  }

  if (companies.length === 0) {
    return (
      <div className="max-w-7xl mx-auto space-y-8 p-8">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-2xl font-bold text-foreground">Welcome to Checklist</h1>
          <p className="text-sm text-muted-foreground mt-1">Set up your first company to get started.</p>
        </motion.div>
        <div className="bg-card border border-border rounded-lg shadow-sm p-6 max-w-md">
          <a href="/dashboard" className="text-primary hover:underline">Set Up Company</a>
        </div>
      </div>
    );
  }

  // Show company selector - don't auto-redirect
  return (
    <div className="max-w-7xl mx-auto space-y-8 p-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-foreground">Select Company</h1>
        <p className="text-sm text-muted-foreground mt-1">Choose which company to work with.</p>
      </motion.div>

      <div className="grid gap-3 max-w-md">
        {companies.map((c: any) => (
          <button
            key={c.id}
            onClick={() => handleSelectCompany(c.id)}
            className="w-full flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:bg-muted transition-colors text-left"
          >
            <div>
              <p className="font-medium text-foreground">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.industry}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      <div className="pt-4">
        <a href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
          + Add new company
        </a>
      </div>
    </div>
  );
}