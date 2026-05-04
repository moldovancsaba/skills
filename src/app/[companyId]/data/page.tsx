'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { FileUp, Plus, CheckCircle, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormTextarea } from "@/components/ui/form-fields";
import { HashtagInput } from "@/components/ui/hashtag-input";
import { MetricCard, MetricGrid, Notice, PageHeader, PageShell, UnifiedGrid } from "@/components/ui/app-shell";
import { SourceDataCard } from "@/components/source-data-card";
import { MemberList } from "@/components/member-list";
import { ExpertTipCard } from "@/components/expert-tip-card";
import { getDashboardExpertTip } from "@/content/help";
import React from "react";
import {
  matchesAllHashtags,
  normalizeSourceHashtags,
  parseHashtagFilterParam,
  stringifyHashtagFilterParam,
} from "@/lib/hashtags";
import { cn } from "@/lib/utils";

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
  intelligenceType?: "INTERNAL" | "COMPETITOR";
  createdAt: string;
  updatedAt: string;
  iceScore?: number;
}

function sortDataItems(items: DataItem[], sortBy: "ICE" | "CREATED" | "UPDATED") {
  return [...items].sort((left, right) => {
    if (sortBy === "ICE") {
      const leftIce = left.iceScore ?? 50;
      const rightIce = right.iceScore ?? 50;
      if (leftIce !== rightIce) return rightIce - leftIce;
    }

    if (sortBy === "UPDATED") {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    if (sortBy === "CREATED") {
      return right.createdAt.localeCompare(left.createdAt);
    }

    // Default: Public ID or Created At
    const leftPublicId = left.publicId ?? Number.MAX_SAFE_INTEGER;
    const rightPublicId = right.publicId ?? Number.MAX_SAFE_INTEGER;

    if (leftPublicId !== rightPublicId) {
      return leftPublicId - rightPublicId;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

export default function CompanyDataPage() {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const companyId = params.companyId as string;
  
  const { company, setCompany, sources, setSources } = useStore();
  const [input, setInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [activeHashtags, setActiveHashtags] = useState<string[]>([]);
  const [intelligenceType, setIntelligenceType] = useState<"INTERNAL" | "COMPETITOR">("INTERNAL");
  const [listIntelligenceFilter, setListIntelligenceFilter] = useState<"ALL" | "INTERNAL" | "COMPETITOR">("ALL");
  const [sortBy, setSortBy] = useState<"ICE" | "CREATED" | "UPDATED">("CREATED");

  const loadAllData = useCallback(async (cid: string) => {
    const [s, f] = await Promise.all([
      fetch(`/api/sources?companyId=${cid}`).then((res) => res.json()),
      fetch(`/api/data-files?companyId=${cid}`).then((res) => res.json()),
    ]);
    setSources(s);
    
    const all = [
      ...s.map((x: any) => ({ ...x, name: x.content, type: "source" as DataType })),
      ...f.map((x: any) => ({ ...x, type: "file" as DataType })),
    ];
    setItems(all);
    setLoading(false);
  }, [setSources]);

  useEffect(() => {
    if (!companyId) return;

    const loadCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        if (!Array.isArray(companies)) {
          console.error("Invalid companies response:", companies);
          return;
        }
        const found = companies.find((c: any) => c.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);
        await loadAllData(found.id);

        // Fetch additional context for the Expert Tip and Member List
        const [f, nba, members, sessionRes] = await Promise.all([
          fetch(`/api/data-files?companyId=${cid}`).then((res) => res.json()),
          fetch(`/api/nba?companyId=${cid}`).then((res) => res.json()),
          fetch(`/api/companies/${cid}/members`).then((res) => res.json()),
          fetch("/api/auth/session")
        ]);

        setFileCount(Array.isArray(f) ? f.length : 0);
        setPendingTaskCount(Array.isArray(nba) ? nba.filter((t: any) => t.status === "PENDING").length : 0);

        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const myMembership = Array.isArray(members) ? members.find((m: any) => m.email === session.email) : null;
          setIsOwner(myMembership?.role === "OWNER" || myMembership?.role === "SUPERADMIN");
        }

        await loadAllData(found.id);
      } catch (error) {
        console.error(error);
      }
    };

    loadCompany(companyId);
  }, [companyId, router, setCompany, loadAllData]);

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
          body: JSON.stringify({
            content: input,
            name: input,
            hashtags: normalizedHashtags,
            intelligenceType,
          }),
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Failed to update source");
        }
      } else if (selectedFiles.length > 0) {
        const formData = new FormData();
        formData.append("companyId", company.id);
        formData.append("hashtags", JSON.stringify(normalizedHashtags));
        for (const file of selectedFiles) {
          formData.append("files", file);
        }
        const response = await fetch("/api/data-files", {
          method: "POST",
          body: formData,
        });
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
            intelligenceType,
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
    setIntelligenceType(item.intelligenceType ?? "INTERNAL");
    setSelectedFiles([]);
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setInput("");
    setHashtags([]);
    setIntelligenceType("INTERNAL");
    setSelectedFiles([]);
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

  const deleteItem = async (item: DataItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    if (!company) return;
    
    const endpoint = item.type === "file" ? "/api/data-files" : "/api/sources";

    await fetch(`${endpoint}?id=${item.id}`, {
      method: "DELETE",
    });

    loadAllData(company.id);
  };

  const handleConvert = async (id: string, targetType: string) => {
    if (!company) return;
    try {
      const res = await fetch("/api/intelligence/convert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceId: id,
          sourceType: "SOURCE",
          targetType: targetType === "KNOWLEDGE" ? "FLASHCARD" : targetType === "GOAL" ? "GOALCARD" : "TASKCARD",
          companyId: company.id
        })
      });
      if (res.ok) {
        loadAllData(company.id);
      }
    } catch (err) {
      console.error("Conversion failed:", err);
    }
  };

  const filteredItems = items.filter((item) => {
    const matchesHashtags = matchesAllHashtags(item.hashtags ?? [], activeHashtags);
    const matchesIntelligence = listIntelligenceFilter === "ALL" || item.intelligenceType === listIntelligenceFilter;
    return matchesHashtags && matchesIntelligence;
  });

  const sortedItems = sortDataItems(filteredItems, sortBy);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="full">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader
          backHref={`/${companyId}`}
          backLabel="Back"
          title={editingId ? "Edit Data" : "Add Data"}
          description={editingId ? "Edit the selected raw source from the list below." : "Store raw URLs, notes, and files with hashtags. Processing happens later."}
        />
      </motion.div>

      <Card id="data-form-container">
        <CardContent className="space-y-4 p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {editingId ? (
              <Notice title="Editing Selected Source">
                You are editing an existing source in the top form. Save changes here or cancel to return to add mode.
              </Notice>
            ) : null}
            <FormTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a URL, type a source name, or write notes..."
              className="min-h-[120px] text-base resize-y"
              rows={5}
            />

            {!editingId ? (
              <div className="space-y-3">
                <label className="text-sm font-medium text-foreground">Files</label>
                <input
                  type="file"
                  multiple
                  onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                  className="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                />
                {selectedFiles.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedFiles.map((file) => (
                      <Badge key={`${file.name}-${file.size}`} variant="secondary" className="rounded-full">
                        {file.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            <HashtagInput
              value={hashtags}
              onChange={setHashtags}
              suggestions={hashtagSuggestions}
              label="Hashtags (Attribute)"
              placeholder="Add hashtags like #soccer, #academy, #pricing, #performance"
            />

            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground">Intelligence Focus</label>
              <div className="flex gap-2">
                {(["INTERNAL", "COMPETITOR"] as const).map((type) => (
                  <Badge
                    key={type}
                    variant={intelligenceType === type ? "default" : "outline"}
                    className={cn(
                      "cursor-pointer px-4 py-1.5 text-xs transition-all",
                      intelligenceType === type 
                        ? (type === "COMPETITOR" ? "bg-amber-600 hover:bg-amber-700" : "bg-blue-600 hover:bg-blue-700")
                        : "hover:bg-accent"
                    )}
                    onClick={() => setIntelligenceType(type)}
                  >
                    {type === "INTERNAL" ? "My Company" : "Market / Competitor"}
                  </Badge>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {intelligenceType === "INTERNAL" 
                  ? "Insights about your own product, operations, and performance." 
                  : "Insights about market competitors and industry benchmarks. These are managed separately."}
              </p>
            </div>

            <div className="flex justify-end gap-2">
              {editingId ? (
                <Button type="button" variant="ghost" onClick={cancelEdit}>
                  Cancel
                </Button>
              ) : null}
              <Button type="submit" disabled={(!input.trim() && selectedFiles.length === 0) || !company}>
                <Plus className="w-4 h-4" />
                {editingId ? "Save changes" : "Add data"}
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

      {errorMessage ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Notice variant="destructive" title="Save failed">
            {errorMessage}
          </Notice>
        </motion.div>
      ) : null}

      <MetricGrid>
        <MetricCard icon={ScrollText} label="Sources" value={sources.length} />
        <MetricCard icon={FileUp} label="Files" value={items.filter((item) => item.type === "file").length} />
      </MetricGrid>

      <div>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
          <h2 className="text-lg font-bold tracking-tight text-white">
            All Data ({filteredItems.length}{activeHashtags.length > 0 || listIntelligenceFilter !== "ALL" ? ` of ${items.length}` : ""})
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            {/* Focus Filter */}
            <div className="bg-zinc-900/50 p-1 rounded-lg border border-white/5 flex gap-1">
              {(["ALL", "INTERNAL", "COMPETITOR"] as const).map((type) => (
                <Button
                  key={type}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-4 text-xs font-bold uppercase tracking-tight transition-all",
                    listIntelligenceFilter === type 
                      ? (type === "COMPETITOR" ? "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30" : (type === "INTERNAL" ? "bg-blue-500/20 text-blue-500 hover:bg-blue-500/30" : "bg-white/10 text-white"))
                      : "text-muted-foreground hover:text-white"
                  )}
                  onClick={() => setListIntelligenceFilter(type)}
                >
                  {type === "ALL" ? "All Focus" : type === "INTERNAL" ? "My Company" : "Competitors"}
                </Button>
              ))}
            </div>

            {/* Sort Controls */}
            <div className="bg-zinc-900/50 p-1 rounded-lg border border-white/5 flex gap-1">
              {(["CREATED", "UPDATED", "ICE"] as const).map((sort) => (
                <Button
                  key={sort}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 px-4 text-xs font-bold uppercase tracking-tight transition-all",
                    sortBy === sort ? "bg-white/10 text-white" : "text-muted-foreground hover:text-white"
                  )}
                  onClick={() => setSortBy(sort)}
                >
                  {sort === "CREATED" ? "Created" : sort === "UPDATED" ? "Updated" : "ICE"}
                </Button>
              ))}
            </div>
          </div>
        </div>
        {filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet. Add your first item above.</p>
        ) : (
          <UnifiedGrid>
            {sortedItems.map((item, index) => {
              const tip = getDashboardExpertTip({
                companyId,
                productCount: sources.length,
                customerCount: 0,
                competitorCount: 0,
                fileCount,
                flashcardCount: 0, // Not loaded on this page specifically, or can be fetched
                pendingTaskCount,
              });

              return (
                <React.Fragment key={item.id}>
                  <SourceDataCard
                    id={item.id}
                    publicId={item.publicId}
                    name={item.name}
                    type={item.type}
                    intelligenceType={item.intelligenceType}
                    hashtags={item.hashtags ?? []}
                    iceScore={item.iceScore}
                    onStartEdit={() => startEdit(item)}
                    onDelete={() => deleteItem(item)}
                    activeHashtags={activeHashtags}
                    onToggleHashtag={toggleHashtagFilter}
                    onConvert={handleConvert}
                  />

                  {/* Inject Expert Tip and Team Members at 3rd place (index 1 is after 2nd item) */}
                  {index === 1 && (
                    <React.Fragment>
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <ExpertTipCard tip={tip} />
                      </motion.div>
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                      >
                        <MemberList companyId={companyId} isOwner={isOwner} />
                      </motion.div>
                    </React.Fragment>
                  )}
                </React.Fragment>
              );
            })}
          </UnifiedGrid>
        )}
      </div>
    </PageShell>
  );
}
