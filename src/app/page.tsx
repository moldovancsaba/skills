'use client';

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { motion } from "framer-motion";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setCompany, setProducts, setCustomers, setCompetitors } = useStore();
  const [companies, setCompanies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const companyParam = searchParams.get("company");

  useEffect(() => {
    fetch("/api/companies")
      .then(res => res.json())
      .then(data => {
        setCompanies(data);
        setLoading(false);
        
        if (companyParam) {
          const found = data.find((c: any) => c.id === companyParam);
          if (found) {
            selectCompany(found);
          }
        }
      })
      .catch(console.error);
  }, [companyParam]);

  const selectCompany = (company: any) => {
    setCompany(company);
    setProducts([]);
    setCustomers([]);
    setCompetitors([]);
    router.push(`/dashboard?company=${company.id}`);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold">Select Company</h1>
      </motion.div>

      {companies.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No companies yet.</p>
          <button onClick={() => router.push('/dashboard')} className="bg-primary text-primary-foreground px-4 py-2 rounded-md">
            Create First Company
          </button>
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
                <p className="font-medium">{c.name}</p>
                <p className="text-xs text-muted-foreground">{c.industry}</p>
              </div>
              <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                {c.id.slice(0,8)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="pt-4 border-t">
        <button onClick={() => router.push('/dashboard')} className="text-primary hover:underline">
          + Create new company
        </button>
      </div>
    </div>
  );
}