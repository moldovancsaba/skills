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

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: "", industry: "" });

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
    router.push(`/${company.id}`);
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    
    if (res.ok) {
      const newCompany = await res.json();
      setFormData({ name: "", industry: "" });
      setShowForm(false);
      selectCompany(newCompany);
    }
  };

  const handleUpdateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !editingId) return;
    
    const res = await fetch(`/api/companies?id=${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    
    if (res.ok) {
      setFormData({ name: "", industry: "" });
      setEditingId(null);
      fetch("/api/companies").then(r => r.json()).then(setCompanies);
    }
  };

  const handleDeleteCompany = async (id: string) => {
    if (!confirm("Delete this company?")) return;
    
    const res = await fetch(`/api/companies?id=${id}`, {
      method: "DELETE",
    });
    
    if (res.ok) {
      fetch("/api/companies").then(r => r.json()).then(setCompanies);
    }
  };

  const startEdit = (c: any) => {
    setFormData({ name: c.name, industry: c.industry || "" });
    setEditingId(c.id);
    setShowForm(true);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 p-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold">Select Company</h1>
      </motion.div>

      <div className="flex justify-end">
        <Link href="/auth" className="text-sm text-muted-foreground hover:text-foreground">
          Sign in with SSO
        </Link>
      </div>

      {(companies.length === 0 || showForm) ? (
        <form onSubmit={editingId ? handleUpdateCompany : handleCreateCompany} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Company Name</label>
            <input 
              required 
              className="flex h-10 w-full border rounded-md px-3 py-2 text-sm" 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              placeholder="Enter company name"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Industry</label>
            <input 
              className="flex h-10 w-full border rounded-md px-3 py-2 text-sm" 
              value={formData.industry} 
              onChange={e => setFormData({...formData, industry: e.target.value})} 
              placeholder="e.g., SaaS, E-commerce"
            />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md">
              {editingId ? "Update" : "Create"} Company
            </button>
            {editingId && (
              <button type="button" onClick={() => { setEditingId(null); setFormData({ name: "", industry: "" }); setShowForm(false); }} className="px-4 py-2 text-muted-foreground">
                Cancel
              </button>
            )}
          </div>
        </form>
      ) : (
        <div className="space-y-2">
          {companies.map((c: any) => (
            <div key={c.id} className="flex items-center gap-2">
              <button
                onClick={() => selectCompany(c)}
                className="flex-1 flex items-center justify-between p-4 bg-card border border-border rounded-lg hover:bg-muted transition-colors text-left"
              >
                <div>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.industry}</p>
                </div>
                <span className="text-xs text-muted-foreground font-mono bg-muted px-2 py-1 rounded">
                  {c.id.slice(0,8)}
                </span>
              </button>
              <button onClick={() => startEdit(c)} className="px-3 py-2 text-sm text-muted-foreground hover:text-foreground border rounded">
                Edit
              </button>
              <button onClick={() => handleDeleteCompany(c.id)} className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 border border-red-200 rounded">
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="pt-4 border-t">
        <button onClick={() => setShowForm(true)} className="text-primary hover:underline">
          + Create new company
        </button>
      </div>
    </div>
  );
}