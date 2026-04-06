'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Hash, Package, Users, Search, Plus, CheckCircle, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormInput, FormSelect } from "@/components/ui/form-fields";
import { HashtagInput } from "@/components/ui/hashtag-input";
import { MetricCard, MetricGrid, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import {
  defaultTypeHashtags,
  normalizeSourceHashtags,
  sourceTypeFromHashtags,
} from "@/lib/hashtags";

type DataType = "product" | "customer" | "competitor";

interface DataItem {
  id: string;
  publicId: number | null;
  name: string;
  type: DataType;
  hashtags: string[];
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
  const [hashtags, setHashtags] = useState<string[]>(defaultTypeHashtags("product"));
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

    const type = sourceTypeFromHashtags(hashtags);
    const normalizedHashtags = normalizeSourceHashtags(hashtags, type);
    const endpoint = type === "product" ? "/api/products" 
      : type === "customer" ? "/api/customers" 
      : "/api/competitors";

    const payload = type === "product" 
      ? {
          companyId: company.id,
          name: input,
          hashtags: normalizedHashtags,
          urls: [],
          features: [],
        }
      : type === "customer"
      ? { companyId: company.id, name: input, hashtags: normalizedHashtags, segments: [], painPoints: [], channels: [] }
      : {
          companyId: company.id,
          name: input,
          hashtags: normalizedHashtags,
          urls: [],
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
      setHashtags(defaultTypeHashtags("product"));
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

  const hashtagSuggestions = Array.from(
    new Set(
      [
        ...defaultTypeHashtags("product"),
        "#customer",
        "#competitor",
        "#website",
        "#social",
        "#pricing",
        "#market",
        "#research",
        ...items.flatMap((item) => item.hashtags ?? []),
      ],
    ),
  );

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
    <PageShell width="md">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          backHref={`/${companyId}`}
          backLabel="Back"
          title="Add Data"
          description="Quickly add products, customers, or competitors."
        />
      </motion.div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormInput
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a URL or describe the source you want to ingest..."
              className="h-14 text-base"
            />

            <HashtagInput
              value={hashtags}
              onChange={setHashtags}
              suggestions={hashtagSuggestions}
              label="Hashtags"
              placeholder="Add hashtags like #product, #customer, #competitor, #pricing"
            />

            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Use one of <span className="font-medium text-foreground">#product</span>, <span className="font-medium text-foreground">#customer</span>, or <span className="font-medium text-foreground">#competitor</span> to classify the source.
              </p>
              <Button type="submit" disabled={!input.trim() || !company}>
                <Plus className="w-4 h-4" />
                Add data
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {saved && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Notice icon={CheckCircle} title="Saved">
            The raw source was stored. Any enrichment happens separately in the local pipeline.
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
                      <div className="mt-2 flex flex-wrap gap-2">
                        {(item.hashtags ?? []).map((tag) => (
                          <Badge key={tag} variant="outline" className="gap-1 rounded-full">
                            <Hash className="h-3 w-3" />
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <Badge variant="secondary" className="text-xs font-mono">
                    {item.publicId ? `#${item.publicId}` : "pending"}
                  </Badge>
                  {editingId === item.id ? (
                    <Button onClick={() => saveEdit(item)} variant="outline" size="sm">Save</Button>
                  ) : (
                    <Button onClick={() => startEdit(item)} variant="ghost" size="icon">
                      <Pencil className="w-3 h-3" />
                    </Button>
                  )}
                  <Button onClick={() => deleteItem(item)} variant="ghost" size="icon">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
