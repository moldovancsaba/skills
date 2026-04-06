'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Package, Users, Search, Plus, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormSelect } from "@/components/ui/form-fields";
import { MetricCard, MetricGrid, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";

type DataType = "product" | "customer" | "competitor";

interface DataItem {
  id: string;
  publicId: number | null;
  name: string;
  type: DataType;
  description?: string;
  createdAt: string;
}

function sortDataItems(items: DataItem[]) {
  return [...items].sort((left, right) => {
    const leftPublicId = left.publicId ?? Number.MAX_SAFE_INTEGER;
    const rightPublicId = right.publicId ?? Number.MAX_SAFE_INTEGER;

    if (leftPublicId !== rightPublicId) {
      return leftPublicId - rightPublicId;
    }

    return left.createdAt.localeCompare(right.createdAt);
  });
}

export default function DataCollectionPage() {
  const router = useRouter();
  const { company, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [input, setInput] = useState("");
  const [type, setType] = useState<DataType>("product");
  const [saved, setSaved] = useState(false);
  const [items, setItems] = useState<DataItem[]>([]);

  const loadAllData = useCallback(async (companyId: string) => {
    const [p, c, r] = await Promise.all([
      fetch(`/api/products?companyId=${companyId}`).then((res) => res.json()),
      fetch(`/api/customers?companyId=${companyId}`).then((res) => res.json()),
      fetch(`/api/competitors?companyId=${companyId}`).then((res) => res.json()),
    ]);
    setProducts(p);
    setCustomers(c);
    setCompetitors(r);
    
    const all = sortDataItems([
      ...p.map((x: any) => ({ ...x, type: "product" as DataType })),
      ...c.map((x: any) => ({ ...x, type: "customer" as DataType })),
      ...r.map((x: any) => ({ ...x, type: "competitor" as DataType })),
    ]);
    setItems(all);
  }, [setProducts, setCustomers, setCompetitors]);

  useEffect(() => {
    const loadForCompany = async () => {
      if (!company) {
        const res = await fetch("/api/companies");
        const data = await res.json();
        if (data.length > 0) {
          await loadAllData(data[0].id);
        }
        return;
      }
      await loadAllData(company.id);
    };

    void loadForCompany();
  }, [company, loadAllData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !company) return;

    const endpoint = type === "product" ? "/api/products" 
      : type === "customer" ? "/api/customers" 
      : "/api/competitors";

    const payload = type === "product" 
      ? {
          companyId: company.id,
          name: input,
          urls: [],
          features: [],
        }
      : type === "customer"
      ? { companyId: company.id, name: input, segments: [], painPoints: [], channels: [] }
      : {
          companyId: company.id,
          name: input,
          urls: [],
          strengths: [],
          weaknesses: [],
        };

    try {
      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      setInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      
      // Reload data
      const res = await fetch(`/api/${type}s?companyId=${company.id}`);
      const data = await res.json();
      
      if (type === "product") setProducts(data);
      else if (type === "customer") setCustomers(data);
      else setCompetitors(data);
      
      loadAllData(company.id);
    } catch (error) {
      console.error(error);
    }
  };

  const getIcon = (t: DataType) => {
    switch (t) {
      case "product": return Package;
      case "customer": return Users;
      case "competitor": return Search;
    }
  };

  return (
    <PageShell width="md">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          title="Add Data"
          description="Quickly add raw products, customers, or competitors."
        />
      </motion.div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <FormSelect
          value={type}
          onChange={(e) => setType(e.target.value as DataType)}
          options={[
            { value: "product", label: "Product" },
            { value: "customer", label: "Customer" },
            { value: "competitor", label: "Competitor" },
          ]}
          className="w-36"
        />
        
        <FormInput
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Add a ${type} name or URL...`}
          className="flex-1"
        />
        
        <Button type="submit" disabled={!input.trim() || !company}>
          <Plus className="w-4 h-4" />
          Add
        </Button>
      </form>

      {saved && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Notice icon={CheckCircle} title="Saved">
            The raw source was stored. Processing happens later in the local pipeline.
          </Notice>
        </motion.div>
      )}

      <MetricGrid>
        <MetricCard icon={Package} label="Products" value={products.length} />
        <MetricCard icon={Users} label="Customers" value={customers.length} />
        <MetricCard icon={Search} label="Competitors" value={competitors.length} />
      </MetricGrid>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">All Data ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet. Add your first item above.</p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const Icon = getIcon(item.type);
              return (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-lg">
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-sm text-foreground">{item.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {item.publicId ? `Source #${item.publicId}` : item.id}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-xs font-mono">
                    {item.publicId ? `#${item.publicId}` : "pending"}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
