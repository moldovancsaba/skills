'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Package, Users, Search, Plus, CheckCircle, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FormInput, FormSelect, FormTextarea } from "@/components/ui/form-fields";
import { normalizeQuickAddInput } from "@/lib/url-enrichment";

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

export default function CompanyDataPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { company, setCompany, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [input, setInput] = useState("");
  const [type, setType] = useState<DataType>("product");
  const [saved, setSaved] = useState(false);
  const [items, setItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const loadAllData = useCallback(async (cid: string) => {
    const [p, c, r] = await Promise.all([
      fetch(`/api/products?companyId=${cid}`).then((res) => res.json()),
      fetch(`/api/customers?companyId=${cid}`).then((res) => res.json()),
      fetch(`/api/competitors?companyId=${cid}`).then((res) => res.json()),
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
    setLoading(false);
  }, [setProducts, setCustomers, setCompetitors]);

  useEffect(() => {
    if (!companyId) return;

    const loadCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        const found = companies.find((c: any) => c.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);
        await loadAllData(found.id);
      } catch (error) {
        console.error(error);
      }
    };

    loadCompany(companyId);
  }, [companyId, router, setCompany, loadAllData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !company) return;

    const normalized = normalizeQuickAddInput(input);

    const endpoint = type === "product" ? "/api/products" 
      : type === "customer" ? "/api/customers" 
      : "/api/competitors";

    const payload = type === "product" 
      ? {
          companyId: company.id,
          name: normalized.name,
          urls: normalized.urls,
          features: [],
        }
      : type === "customer"
      ? { companyId: company.id, name: input, segments: [], painPoints: [], channels: [] }
      : {
          companyId: company.id,
          name: normalized.name,
          urls: normalized.urls,
          strengths: [],
          weaknesses: [],
        };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      
      if (res.ok) {
        fetch("/api/webhook/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            companyId: company.id, 
            dataType: type, 
            action: "create" 
          }),
        }).catch(() => {});
      }
      
      setInput("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      
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

  const startEdit = (item: DataItem) => {
    setEditingId(item.id);
    setEditName(item.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
  };

  const saveEdit = async (item: DataItem) => {
    const endpoint = item.type === "product" ? "/api/products" 
      : item.type === "customer" ? "/api/customers" 
      : "/api/competitors";

    await fetch(`${endpoint}?id=${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName }),
    });

cancelEdit();
    if (company) loadAllData(company.id);
  };

  const deleteItem = async (item: DataItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    if (!company) return;
    
    const endpoint = item.type === "product" ? "/api/products" 
      : item.type === "customer" ? "/api/customers" 
      : "/api/competitors";

    await fetch(`${endpoint}?id=${item.id}`, {
      method: "DELETE",
    });

    loadAllData(company.id);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2">
          <a href={`/${companyId}`} className="text-sm text-primary hover:underline">← Back</a>
        </div>
        <h1 className="text-2xl font-bold text-foreground mt-2">Add Data</h1>
        <p className="text-sm text-muted-foreground mt-1">Quickly add products, customers, or competitors.</p>
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
        
        <button
          type="submit"
          disabled={!input.trim() || !company}
          className="flex items-center gap-2 h-12 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </form>

      {saved && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">Saved!</span>
        </motion.div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <Package className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-bold text-foreground">{products.length}</p>
          <p className="text-xs text-muted-foreground">Products</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <Users className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-bold text-foreground">{customers.length}</p>
          <p className="text-xs text-muted-foreground">Customers</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 text-center">
          <Search className="w-5 h-5 mx-auto mb-1 text-muted-foreground" />
          <p className="text-2xl font-bold text-foreground">{competitors.length}</p>
          <p className="text-xs text-muted-foreground">Competitors</p>
        </div>
      </div>

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
                  {editingId === item.id ? (
                    <FormInput
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="flex-1"
                      onKeyDown={(e) => e.key === "Enter" && saveEdit(item)}
                      autoFocus
                    />
                  ) : (
                    <div className="flex-1">
                      <p className="text-sm text-foreground">{item.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {item.publicId ? `Source #${item.publicId}` : item.id}
                      </p>
                    </div>
                  )}
                  <Badge variant="secondary" className="text-xs font-mono">
                    {item.publicId ? `#${item.publicId}` : "pending"}
                  </Badge>
                  <Badge variant="outline" className="text-xs capitalize">{item.type}</Badge>
                  {editingId === item.id ? (
                    <button onClick={() => saveEdit(item)} className="text-green-600 text-xs">Save</button>
                  ) : (
                    <button onClick={() => startEdit(item)} className="text-muted-foreground hover:text-foreground">
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button onClick={() => deleteItem(item)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
