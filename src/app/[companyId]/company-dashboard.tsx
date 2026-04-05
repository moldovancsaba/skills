'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import { Brain, Package, Plus, Users, Search, Sparkles, Zap } from "lucide-react";
import { motion } from "framer-motion";

export default function CompanyDashboard() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { company, setCompany, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        const found = companies.find((c: any) => c.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);

        const [p, c, r] = await Promise.all([
          fetch(`/api/products?companyId=${found.id}`).then((res) => res.json()),
          fetch(`/api/customers?companyId=${found.id}`).then((res) => res.json()),
          fetch(`/api/competitors?companyId=${found.id}`).then((res) => res.json()),
        ]);

        setProducts(p);
        setCustomers(c);
        setCompetitors(r);
        setLoading(false);
      } catch (error) {
        console.error(error);
      }
    };

    fetchCompany(companyId);
  }, [companyId, router, setCompany, setProducts, setCustomers, setCompetitors]);

  const stats = [
    { label: "Products", value: products.length, icon: Package, color: "text-blue-500" },
    { label: "Customers", value: customers.length, icon: Users, color: "text-green-500" },
    { label: "Competitors", value: competitors.length, icon: Search, color: "text-purple-500" },
  ];

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-4 md:p-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold">{company?.name}</h1>
            <a href="/" className="text-sm text-primary hover:underline">Switch company</a>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-4">
        {stats.map((stat, i) => (
          <motion.div 
            key={stat.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-4 bg-card border border-border rounded-lg"
          >
            <stat.icon className={`w-5 h-5 mb-2 ${stat.color}`} />
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <a href={`/${companyId}/data`} className="p-6 border border-border rounded-lg hover:bg-muted transition-colors group">
          <Plus className="w-6 h-6 mb-2 text-muted-foreground group-hover:text-foreground" />
          <p className="font-medium">Data Collection</p>
          <p className="text-sm text-muted-foreground">Add products, customers, competitors</p>
        </a>
        <a href={`/${companyId}/nba`} className="p-6 border border-border rounded-lg hover:bg-muted transition-colors group">
          <Brain className="w-6 h-6 mb-2 text-muted-foreground group-hover:text-foreground" />
          <p className="font-medium">Recommendations</p>
          <p className="text-sm text-muted-foreground">View NBA suggestions</p>
        </a>
        <a href={`/${companyId}/knowmore`} className="p-6 border border-border rounded-lg hover:bg-muted transition-colors group">
          <Sparkles className="w-6 h-6 mb-2 text-muted-foreground group-hover:text-foreground" />
          <p className="font-medium">Knowmore</p>
          <p className="text-sm text-muted-foreground">Track the knowledge layer behind your AI</p>
        </a>
      </div>

      <div className="fixed bottom-6 right-6 md:bottom-8 md:right-8">
        <button
          onClick={() => router.push(`/${companyId}/data`)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-3 rounded-full shadow-lg hover:bg-primary/90 transition-all hover:scale-105"
        >
          <Zap className="w-5 h-5" />
          <span className="font-medium">Quick Add</span>
        </button>
      </div>
    </div>
  );
}
