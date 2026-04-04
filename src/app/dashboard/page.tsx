'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Target, BarChart3, Users, Package, Search, ChevronRight, Plus } from "lucide-react";

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get("company");
  
  const { company, setCompany, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", industry: "", description: "", targetMarket: "", mainGoal: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId && !company) {
      router.push("/");
      return;
    }

    // If we have a company ID in URL, load it
    if (companyId) {
      fetch(`/api/companies`)
        .then(res => res.json())
        .then(data => {
          const found = data.find((c: any) => c.id === companyId);
          if (found) {
            setCompany(found);
            loadCompanyData(found.id);
          } else {
            router.push("/");
          }
        });
    } else if (company) {
      loadCompanyData(company.id);
    }
  }, [companyId]);

  const loadCompanyData = (cid: string) => {
    Promise.all([
      fetch(`/api/products?companyId=${cid}`).then(r => r.json()),
      fetch(`/api/customers?companyId=${cid}`).then(r => r.json()),
      fetch(`/api/competitors?companyId=${cid}`).then(r => r.json()),
    ]).then(([p, c, r]) => {
      setProducts(p);
      setCustomers(c);
      setCompetitors(r);
      setLoading(false);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    
    if (res.ok) {
      const newCompany = await res.json();
      setCompany(newCompany);
      setShowForm(false);
      router.push(`/dashboard?company=${newCompany.id}`);
    }
    setLoading(false);
  };

  if (loading || !company) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  if (showForm) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 p-8">
        <h1 className="text-2xl font-bold">Set Up Your Company</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Company Name</label>
            <input required className="flex h-10 w-full border rounded-md px-3 py-2 text-sm" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
          </div>
          <div>
            <label className="text-sm font-medium">Industry</label>
            <input className="flex h-10 w-full border rounded-md px-3 py-2 text-sm" value={formData.industry} onChange={e => setFormData({...formData, industry: e.target.value})} />
          </div>
          <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md">Save Company</button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">{company.name}</h1>
          <a href="/" className="text-sm text-primary hover:underline">Switch company</a>
        </div>
        <button onClick={() => setShowForm(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded-md">Add Company</button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg">
          <p className="text-xs text-muted-foreground">Products</p>
          <p className="text-2xl font-bold">{products.length}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-xs text-muted-foreground">Customers</p>
          <p className="text-2xl font-bold">{customers.length}</p>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-xs text-muted-foreground">Competitors</p>
          <p className="text-2xl font-bold">{competitors.length}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <a href="/data" className="p-6 border rounded-lg hover:bg-muted transition-colors">
          <Plus className="w-6 h-6 mb-2" />
          <p className="font-medium">Data Collection</p>
          <p className="text-sm text-muted-foreground">Add products, customers, competitors</p>
        </a>
        <a href="/dashboard" className="p-6 border rounded-lg hover:bg-muted transition-colors">
          <Brain className="w-6 h-6 mb-2" />
          <p className="font-medium">Recommendations</p>
          <p className="text-sm text-muted-foreground">View NBA suggestions</p>
        </a>
      </div>
    </div>
  );
}