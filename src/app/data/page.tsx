'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { FileUp, Plus, CheckCircle, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormTextarea } from "@/components/ui/form-fields";
import { HashtagInput } from "@/components/ui/hashtag-input";
import { MetricCard, MetricGrid, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { SourceDataCard } from "@/components/source-data-card";
import {
  matchesAllHashtags,
  normalizeSourceHashtags,
  parseHashtagFilterParam,
  stringifyHashtagFilterParam,
} from "@/lib/hashtags";
import React from "react";

type DataType = "source" | "file";

interface DataItem {
  id: string;
  publicId: number | null;
  name: string;
  type: DataType;
  hashtags: string[];
  aiClusters?: string[];
  entityTag?: string | null;
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
  const router = useRouter();
  const pathname = usePathname();
  const { company, setCompany, sources, setSources } = useStore();
  const [input, setInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeHashtags, setActiveHashtags] = useState<string[]>([]);

  const loadAllData = useCallback(async (companyId: string) => {
    const [s, f] = await Promise.all([
      fetch(`/api/sources?companyId=${companyId}`).then((res) => res.json()),
      fetch(`/api/data-files?companyId=${companyId}`).then((res) => res.json()),
    ]);
    setSources(s);
    
    const all = sortDataItems([
      ...s.map((x: any) => ({ ...x, name: x.content, type: "source" as DataType })),
      ...f.map((x: any) => ({ ...x, type: "file" as DataType })),
    ]);
    setItems(all);
    setLoading(false);
  }, [setSources]);

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
      } else {
        setLoading(false);
      }
    };

    void loadForCompany();
  }, [company, loadAllData, setCompany]);

  useEffect(() => {
    const syncFromLocation = () => {
      setActiveHashtags(parseHashtagFilterParam(new URLSearchParams(window.location.search).get("tags")));
    };
    syncFromLocation();
    window.addEventListener("popstate", syncFromLocation);
    return () => window.removeEventListener("popstate", syncFromLocation);
  }, []);

  useEffect(() => {
    if (!company) return;

    const loadRecommendations = async () => {
      try {
        const query = new URLSearchParams({
          companyId: company.id,
          selected: stringifyHashtagFilterParam(hashtags),
        });
        const response = await fetch(`/api/hashtags/recommendations?${query.toString()}`);
        if (!response.ok) return;
        const data = await response.json();
        setHashtagSuggestions(Array.isArray(data.recommendations) ? data.recommendations : []);
      } catch (error) {
        console.error(error);
      }
    };

    void loadRecommendations();
  }, [company, hashtags]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && selectedFiles.length === 0) || !company) return;

    const normalizedHashtags = normalizeSourceHashtags(hashtags, "industry");

    try {
      setErrorMessage(null);
      if (editingId) {
        const currentItem = items.find((item) => item.id === editingId);
        if (!currentItem) {
          throw new Error("Edited item not found");
        }
        const editEndpoint = currentItem.type === "file" ? "/api/data-files" : "/api/sources";

        const response = await fetch(`${editEndpoint}?id=${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: input, name: input, hashtags: normalizedHashtags }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Failed to update source");
        }
      } else if (selectedFiles.length > 0) {
        const formData = new FormData();
        formData.append("companyId", company.id);
        formData.append("hashtags", JSON.stringify(normalizedHashtags));
        formData.append("hashtags", JSON.stringify(normalizedHashtags));
        for (const file of selectedFiles) {
          formData.append("files", file);
        }
        const response = await fetch("/api/data-files", { method: "POST", body: formData });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Failed to upload files");
        }
      } else {
        const response = await fetch("/api/sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: company.id,
            content: input,
            hashtags: normalizedHashtags,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Failed to save source");
        }
      }
      
      setInput("");
      setHashtags([]);
      setSelectedFiles([]);
      setSelectedFiles([]);
      setEditingId(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      await loadAllData(company.id);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : "Failed to save data");
    }
  };

  const startEdit = (item: DataItem) => {
    setEditingId(item.id);
    setInput(item.name);
    setHashtags(item.hashtags ?? []);
    setSelectedFiles([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setInput("");
    setHashtags([]);
    setSelectedFiles([]);
  };

  const deleteItem = async (item: DataItem) => {
    if (!confirm(`Delete "${item.name}"?`) || !company) return;
    
    const endpoint = item.type === "file" ? "/api/data-files" : "/api/sources";

    await fetch(`${endpoint}?id=${item.id}`, { method: "DELETE" });
    loadAllData(company.id);
  };

  const toggleHashtagFilter = (tag: string) => {
    const next = activeHashtags.includes(tag)
      ? activeHashtags.filter((item) => item !== tag)
      : [...activeHashtags, tag];
    const nextSearch = new URLSearchParams(window.location.search);
    if (next.length > 0) {
      nextSearch.set("tags", stringifyHashtagFilterParam(next));
    } else {
      nextSearch.delete("tags");
    }
    setActiveHashtags(next);
    router.replace(`${pathname}${nextSearch.toString() ? `?${nextSearch.toString()}` : ""}`, { scroll: false });
  };

  const filteredItems = items.filter((item) => matchesAllHashtags(item.hashtags ?? [], activeHashtags));

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="5xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          title={editingId ? "Edit Data" : "Global Data Collection"}
          description={editingId ? `Editing a raw source for ${company?.name || "your company"}.` : `Managing raw data for ${company?.name || "your company"}.`}
        />
      </motion.div>

      <Card>
        <CardContent className="space-y-4 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {editingId ? (
              <Notice title="Editing Selected Source">
                The selected source is now loaded into the top form. Save it here or cancel to return to add mode.
              </Notice>
            ) : null}
            <FormTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a URL, type a source name, or write notes..."
              className="min-h-[120px] text-base"
              rows={4}
            />

            {!editingId ? (
              <div className="space-y-3">
                <label className="text-sm font-medium">Files</label>
                <input
                  type="file" multiple
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                />
              </div>
            ) : null}

            <HashtagInput
              value={hashtags}
              onChange={setHashtags}
              suggestions={hashtagSuggestions}
              label="Hashtags"
              placeholder="#soccer, #academy..."
            />

            <div className="flex justify-end gap-2 pt-2">
              {editingId ? (
                <Button type="button" variant="ghost" onClick={cancelEdit}>
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" disabled={(!input.trim() && selectedFiles.length === 0) || !company}>
                <Plus className="w-4 h-4" />
                {editingId ? "Save changes" : "Add raw source"}
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

      {errorMessage ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Notice variant="destructive" title="Save failed">
            {errorMessage}
          </Notice>
        </motion.div>
      ) : null}

      <MetricGrid>
        <MetricCard icon={ScrollText} label="Sources" value={sources.length} />
        <MetricCard icon={FileUp} label="Files" value={items.filter(i => i.type === "file").length} />
      </MetricGrid>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">
          All Data ({filteredItems.length}{activeHashtags.length > 0 ? ` of ${items.length}` : ""})
        </h2>
        {filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet.</p>
        ) : (
          <div className="grid gap-4">
            {filteredItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <SourceDataCard
                  id={item.id}
                  publicId={item.publicId}
                  name={item.name}
                  type={item.type}
                  hashtags={item.hashtags ?? []}
                  onStartEdit={() => startEdit(item)}
                  onDelete={() => deleteItem(item)}
                  activeHashtags={activeHashtags}
                  onToggleHashtag={toggleHashtagFilter}
                />
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
