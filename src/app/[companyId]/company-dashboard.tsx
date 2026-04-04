'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import { Brain, Package, Plus, Users, Search } from "lucide-react";

export default function CompanyDashboard() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { company, setCompany, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (companyId) {
      loadCompany(companyId);
    }
  }, [companyId]);

  const loadCompany = (cid: string) => {
    fetch(`/api/companies`)
      .then(res => res.json())
      .then(data => {
        const found = data.find((c: any) => c.id === cid);
        if (found) {
          setCompany(found);
          loadData(found.id);
        } else {
          router.push("/");
        }
      });
  };

  const loadData = (cid: string) => {
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

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 p-8">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold">{company?.name}</h1>
          <a href="/" className="text-sm text-primary hover:underline">Switch company</a>
        </div>
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
        <a href={`/${companyId}/data`} className="p-6 border rounded-lg hover:bg-muted transition-colors">
          <Plus className="w-6 h-6 mb-2" />
          <p className="font-medium">Data Collection</p>
          <p className="text-sm text-muted-foreground">Add products, customers, competitors</p>
        </a>
        <a href={`/${companyId}/nba`} className="p-6 border rounded-lg hover:bg-muted transition-colors">
          <Brain className="w-6 h-6 mb-2" />
          <p className="font-medium">Recommendations</p>
          <p className="text-sm text-muted-foreground">View NBA suggestions</p>
        </a>
      </div>
    </div>
  );
}