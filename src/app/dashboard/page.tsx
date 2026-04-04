'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain, Target, BarChart3, Users, Package, Search, ArrowRight,
  Clock, Bell, ChevronRight, CheckCircle, XCircle, AlertCircle, Plus,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";

interface NBAItem {
  id: string;
  title: string;
  description: string | null;
  iceScore: number;
  status: string;
}

const moduleStatus = [
  { name: "Data Collection", path: "/data", icon: Plus, description: "Add products, customers, competitors" },
  { name: "Strategy", path: "/strategy", icon: Brain, description: "Strategic planning" },
  { name: "Intelligence", path: "/intelligence", icon: Target, description: "Market insights" },
  { name: "Lead Gen", path: "/leads", icon: BarChart3, description: "Lead generation" },
  { name: "CRM", path: "/crm", icon: Users, description: "Customer management" },
  { name: "Portfolio", path: "/portfolio", icon: Package, description: "Offerings" },
  { name: "Content", path: "/content", icon: Search, description: "Content creation" },
  { name: "Brand", path: "/brand", icon: Bell, description: "Brand management" },
];

export default function Dashboard() {
  const router = useRouter();
  const { company, isLoading, setCompany, setLoading, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [nbaItems, setNbaItems] = useState<NBAItem[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showClientSelect, setShowClientSelect] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    industry: "",
    description: "",
    targetMarket: "",
    mainGoal: "",
  });

  useEffect(() => {
    fetch("/api/companies")
      .then(res => res.json())
      .then(data => {
        setCompanies(data);
        if (data.length > 0) {
          setCompany(data[0]);
        }
      })
      .catch(console.error);
  }, []);

  const switchClient = (companyId: string) => {
    const selected = companies.find(c => c.id === companyId);
    if (selected) {
      setCompany(selected);
      setShowClientSelect(false);
      // Reset data
      setProducts([]);
      setCustomers([]);
      setCompetitors([]);
      setNbaItems([]);
      // Load new data
      fetch(`/api/products?companyId=${companyId}`).then(r => r.json()).then(setProducts);
      fetch(`/api/customers?companyId=${companyId}`).then(r => r.json()).then(setCustomers);
      fetch(`/api/competitors?companyId=${companyId}`).then(r => r.json()).then(setCompetitors);
      fetch(`/api/nba?companyId=${companyId}`).then(r => r.json()).then(d => setNbaItems(d.slice(0, 3)));
    }
  };

  useEffect(() => {
    if (company) {
      fetch(`/api/nba?companyId=${company.id}`)
        .then(res => res.json())
        .then(data => setNbaItems(data.slice(0, 3)))
        .catch(console.error);
    }
  }, [company]);

  const handleFeedback = async (nbaItemId: string, action: string, annotation?: string) => {
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nbaItemId,
          action,
          annotation: annotation || null,
        }),
      });
      // Refresh NBA items
      if (company) {
        const res = await fetch(`/api/nba?companyId=${company.id}`);
        setNbaItems((await res.json()).slice(0, 3));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      const newCompany = await res.json();
      setCompany(newCompany);
      setShowForm(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <div className="container"><p>Loading...</p></div>;
  }

  if (!company && !showForm) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="text-2xl font-bold text-foreground">Welcome to Checklist</h1>
          <p className="text-sm text-muted-foreground mt-1">Set up your company to get AI-powered marketing recommendations.</p>
        </motion.div>
        <button onClick={() => setShowForm(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded-md">Set Up Company</button>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-foreground">Set Up Your Company</h1>
        <div className="bg-card border border-border rounded-lg shadow-sm p-6 max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Company Name</label>
              <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-medium">Industry</label>
              <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.industry} onChange={e => setFormData({ ...formData, industry: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Target Market</label>
              <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.targetMarket} onChange={e => setFormData({ ...formData, targetMarket: e.target.value })} />
            </div>
            <button type="submit" className="bg-primary text-primary-foreground px-4 py-2 rounded-md">Save Company</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Command Center</h1>
          {companies.length > 1 ? (
            <button 
              onClick={() => setShowClientSelect(!showClientSelect)}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
            >
              {company?.name} ▼
            </button>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">{company?.name}</p>
          )}
        </div>
        <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Active
        </Badge>
      </motion.div>

      {/* Client Selector Dropdown */}
      {showClientSelect && companies.length > 1 && (
        <div className="absolute right-8 mt-2 bg-card border border-border rounded-lg shadow-lg z-50 w-64">
          {companies.map((c: any) => (
            <button
              key={c.id}
              onClick={() => switchClient(c.id)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                company?.id === c.id ? "bg-muted font-medium" : ""
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Data Collection Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Products" value={String(products.length)} change={`${products.length} added`} changeType="neutral" icon={Package} delay={0} />
        <MetricCard label="Customers" value={String(customers.length)} change={`${customers.length} added`} changeType="neutral" icon={Users} delay={1} />
        <MetricCard label="Competitors" value={String(competitors.length)} change={`${competitors.length} added`} changeType="neutral" icon={Search} delay={2} />
      </div>

      {/* Next Best Actions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Next Best Actions</h2>
          <button 
            onClick={async () => {
              if (!company) return;
              await fetch("/api/brain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: company.id }),
              });
              const res = await fetch(`/api/nba?companyId=${company.id}`);
              setNbaItems((await res.json()).slice(0, 3));
            }}
            className="flex items-center gap-2 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90"
          >
            <Brain className="w-3 h-3" />
            Generate
          </button>
        </div>
        
        {nbaItems.length === 0 ? (
          <div className="bg-card border border-border rounded-lg shadow-sm p-6">
            <div className="text-center text-muted-foreground">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No recommendations yet</p>
              <p className="text-sm mt-1 mb-4">Add data, then click Generate to get AI suggestions.</p>
              <button 
                onClick={async () => {
                  if (!company) return;
                  await fetch("/api/brain", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ companyId: company.id }),
                  });
                  const res = await fetch(`/api/nba?companyId=${company.id}`);
                  setNbaItems((await res.json()).slice(0, 3));
                }}
                disabled={!company || (products.length === 0 && customers.length === 0)}
                className="text-xs bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                Generate Recommendations
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {nbaItems.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="bg-card border border-border rounded-lg shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                      <span className="text-xs text-muted-foreground">ICE: {item.iceScore.toFixed(1)}</span>
                    </div>
                    <h3 className="font-medium text-foreground">{item.title}</h3>
                    {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleFeedback(item.id, "ACCEPT")} className="p-2 rounded-md text-green-600 hover:bg-green-50">
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleFeedback(item.id, "DECLINE")} className="p-2 rounded-md text-red-600 hover:bg-red-50">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Platform Modules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Data Collection</h2>
        </div>
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-card border border-border rounded-lg shadow-sm divide-y divide-border">
          {moduleStatus.map((mod, i) => (
            <motion.div key={mod.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + i * 0.03 }}
              className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group"
              onClick={() => router.push(mod.path)}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <mod.icon className="w-4 h-4 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{mod.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{mod.description}</p>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}