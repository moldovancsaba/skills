'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { motion } from "framer-motion";
import { FileUp, Package, Users, Search, Plus, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormTextarea } from "@/components/ui/form-fields";
import { HashtagInput } from "@/components/ui/hashtag-input";
import { EntityTagSelector } from "@/components/ui/entity-tag-selector";
import { MetricCard, MetricGrid, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { SourceDataCard } from "@/components/source-data-card";
import {
  defaultTypeHashtags,
  normalizeSourceHashtags,
  sourceTypeFromHashtags,
} from "@/lib/hashtags";
import React from "react";

type DataType = "product" | "customer" | "competitor" | "file";

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

export default function GlobalDataCollectionPage() {
  const { company, setCompany, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [input, setInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>(defaultTypeHashtags("product"));
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [entityTag, setEntityTag] = useState<string | null>(null);
  const [entitySuggestions, setEntitySuggestions] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [items, setItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHashtags, setEditHashtags] = useState<string[]>([]);
  const [editEntityTag, setEditEntityTag] = useState<string | null>(null);

  const loadAllData = useCallback(async (companyId: string) => {
    const [p, c, r, f] = await Promise.all([
      fetch(`/api/products?companyId=${companyId}`).then((res) => res.json()),
      fetch(`/api/customers?companyId=${companyId}`).then((res) => res.json()),
      fetch(`/api/competitors?companyId=${companyId}`).then((res) => res.json()),
      fetch(`/api/data-files?companyId=${companyId}`).then((res) => res.json()),
    ]);
    setProducts(p);
    setCustomers(c);
    setCompetitors(r);
    
    const all = sortDataItems([
      ...p.map((x: any) => ({ ...x, type: "product" as DataType })),
      ...c.map((x: any) => ({ ...x, type: "customer" as DataType })),
      ...r.map((x: any) => ({ ...x, type: "competitor" as DataType })),
      ...f.map((x: any) => ({ ...x, type: "file" as DataType })),
    ]);
    setItems(all);
    setLoading(false);
  }, [setProducts, setCustomers, setCompetitors]);

  useEffect(() => {
    const loadForCompany = async () => {
      let activeCompany = company;
      if (!activeCompany) {
        const res = await fetch("/api/companies");
        const data = await res.json();
        if (data.length > 0) {
          activeCompany = data[0];
          setCompany(data[0]);
        }
      }

      if (activeCompany) {
        await loadAllData(activeCompany.id);
        fetch(`/api/entities?companyId=${activeCompany.id}`)
          .then(r => r.ok ? r.json() : [])
          .then(data => setEntitySuggestions(data))
          .catch(console.error);
      } else {
        setLoading(false);
      }
    };

    void loadForCompany();
  }, [company, loadAllData, setCompany]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && selectedFiles.length === 0) || !company) return;

    const type = sourceTypeFromHashtags(hashtags);
    const normalizedHashtags = normalizeSourceHashtags(hashtags, type);
    const endpoint = selectedFiles.length > 0
      ? "/api/data-files"
      : type === "product" ? "/api/products" 
      : type === "customer" ? "/api/customers" 
      : "/api/competitors";

    const payload = type === "product" 
      ? {
          companyId: company.id,
          name: input,
          hashtags: normalizedHashtags,
          entityTag: entityTag ?? undefined,
          urls: [],
          features: [],
        }
      : type === "customer"
      ? { companyId: company.id, name: input, hashtags: normalizedHashtags, entityTag: entityTag ?? undefined, segments: [], painPoints: [], channels: [] }
      : {
          companyId: company.id,
          name: input,
          hashtags: normalizedHashtags,
          entityTag: entityTag ?? undefined,
          urls: [],
          strengths: [],
          weaknesses: [],
        };

    try {
      if (selectedFiles.length > 0) {
        const formData = new FormData();
        formData.append("companyId", company.id);
        formData.append("hashtags", JSON.stringify(normalizedHashtags));
        if (entityTag) formData.append("entityTag", entityTag);
        for (const file of selectedFiles) {
          formData.append("files", file);
        }
        await fetch(endpoint, { method: "POST", body: formData });
      } else {
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      
      setInput("");
      setHashtags(defaultTypeHashtags("product"));
      setSelectedFiles([]);
      setEntityTag(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      await loadAllData(company.id);
    } catch (error) {
      console.error(error);
    }
  };

  const startEdit = (item: DataItem) => {
    setEditingId(item.id);
    setEditName(item.name);
    setEditHashtags(item.hashtags ?? []);
    setEditEntityTag((item as any).entityTag ?? null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditHashtags([]);
    setEditEntityTag(null);
  };

  const saveEdit = async (item: DataItem) => {
    if (!company) return;
    const endpoint = item.type === "product" ? "/api/products" 
      : item.type === "customer" ? "/api/customers" 
      : item.type === "file" ? "/api/data-files"
      : "/api/competitors";

    await fetch(`${endpoint}?id=${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, hashtags: editHashtags, entityTag: editEntityTag }),
    });

    cancelEdit();
    loadAllData(company.id);
  };

  const deleteItem = async (item: DataItem) => {
    if (!confirm(`Delete "${item.name}"?`) || !company) return;
    
    const endpoint = item.type === "file" ? "/api/data-files"
      : item.type === "product" ? "/api/products" 
      : item.type === "customer" ? "/api/customers" 
      : "/api/competitors";

    await fetch(`${endpoint}?id=${item.id}`, { method: "DELETE" });
    loadAllData(company.id);
  };

  const hashtagSuggestions = Array.from(
    new Set([
      ...defaultTypeHashtags("product"),
      "#customer", "#competitor", "#pricing", "#research",
      ...items.flatMap((item) => item.hashtags ?? []),
    ])
  );

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="5xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          title="Global Data Collection"
          description={`Managing raw data for ${company?.name || "your company"}.`}
        />
      </motion.div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <FormTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a URL, type a source name, or write notes..."
              className="min-h-[120px] text-base"
              rows={4}
            />

            <div className="space-y-3">
              <label className="text-sm font-medium">Files</label>
              <input
                type="file" multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>

            <HashtagInput
              value={hashtags}
              onChange={setHashtags}
              suggestions={hashtagSuggestions}
              label="Hashtags"
              placeholder="#product, #customer..."
            />

            <EntityTagSelector
              value={entityTag}
              onChange={setEntityTag}
              suggestions={entitySuggestions}
              label="About (Entity)"
              placeholder="Which entity is this about?"
            />

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={(!input.trim() && selectedFiles.length === 0) || !company}>
                <Plus className="w-4 h-4" />
                Add raw source
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {saved && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Notice icon={CheckCircle} title="Saved">
            Item stored. Processing starts automatically in the local worker.
          </Notice>
        </motion.div>
      )}

      <MetricGrid>
        <MetricCard icon={Package} label="Products" value={products.length} />
        <MetricCard icon={Users} label="Customers" value={customers.length} />
        <MetricCard icon={Search} label="Competitors" value={competitors.length} />
        <MetricCard icon={FileUp} label="Files" value={items.filter(i => i.type === "file").length} />
      </MetricGrid>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">All Data ({items.length})</h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="grid gap-4">
            {items.map((item, index) => (
              <React.Fragment key={item.id}>
                <SourceDataCard
                  id={item.id}
                  publicId={item.publicId}
                  name={item.name}
                  type={item.type}
                  hashtags={item.hashtags ?? []}
                  entityTag={(item as any).entityTag ?? null}
                  isEditing={editingId === item.id}
                  editName={editName}
                  editHashtags={editHashtags}
                  editEntityTag={editEntityTag}
                  onEditNameChange={setEditName}
                  onEditHashtagsChange={setEditHashtags}
                  onEditEntityTagChange={setEditEntityTag}
                  onStartEdit={() => startEdit(item)}
                  onSave={() => saveEdit(item)}
                  onCancel={cancelEdit}
                  onDelete={() => deleteItem(item)}
                  hashtagSuggestions={hashtagSuggestions}
                  entitySuggestions={entitySuggestions}
                />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
