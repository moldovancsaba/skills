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
import { EntityTagSelector } from "@/components/ui/entity-tag-selector";
import { MetricCard, MetricGrid, Notice, PageHeader, PageShell, PipelineAccentHeader } from "@/components/ui/app-shell";
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

export default function CompanyDataPage() {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const companyId = params.companyId as string;
  
  const { company, setCompany, sources, setSources } = useStore();
  const [input, setInput] = useState("");
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [entityTag, setEntityTag] = useState<string | null>(null);
  const [entitySuggestions, setEntitySuggestions] = useState<string[]>([]);
  const [hashtagSuggestions, setHashtagSuggestions] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [items, setItems] = useState<DataItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [fileCount, setFileCount] = useState(0);
  const [pendingTaskCount, setPendingTaskCount] = useState(0);
  const [activeHashtags, setActiveHashtags] = useState<string[]>([]);

  const loadAllData = useCallback(async (cid: string) => {
    const [s, f] = await Promise.all([
      fetch(`/api/sources?companyId=${cid}`).then((res) => res.json()),
      fetch(`/api/data-files?companyId=${cid}`).then((res) => res.json()),
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

        // Fetch entity suggestions
        fetch(`/api/entities?companyId=${found.id}`)
          .then(r => r.ok ? r.json() : [])
          .then(data => setEntitySuggestions(data))
          .catch(console.error);
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
      if (editingId) {
        const currentItem = items.find((item) => item.id === editingId);
        if (!currentItem) {
          throw new Error("Edited item not found");
        }
        const editEndpoint = currentItem.type === "file" ? "/api/data-files" : "/api/sources";

        await fetch(`${editEndpoint}?id=${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: input,
            name: input,
            hashtags: normalizedHashtags,
            entityTag,
          }),
        });
      } else if (selectedFiles.length > 0) {
        const formData = new FormData();
        formData.append("companyId", company.id);
        formData.append("hashtags", JSON.stringify(normalizedHashtags));
        if (entityTag) formData.append("entityTag", entityTag);
        for (const file of selectedFiles) {
          formData.append("files", file);
        }
        await fetch("/api/data-files", {
          method: "POST",
          body: formData,
        });
      } else {
        await fetch("/api/sources", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: company.id,
            content: input,
            hashtags: normalizedHashtags,
            entityTag: entityTag ?? undefined,
          }),
        });
      }
      
      setInput("");
      setHashtags([]);
      setSelectedFiles([]);
      setEntityTag(null);
      setEditingId(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      
      loadAllData(company.id);
    } catch (error) {
      console.error(error);
    }
  };

  const startEdit = (item: DataItem) => {
    setEditingId(item.id);
    setInput(item.name);
    setHashtags(item.hashtags ?? []);
    setEntityTag((item as any).entityTag ?? null);
    setSelectedFiles([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setInput("");
    setHashtags([]);
    setEntityTag(null);
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

  const filteredItems = items.filter((item) => matchesAllHashtags(item.hashtags ?? [], activeHashtags));

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="5xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PipelineAccentHeader
          title="Data"
          icon="looks_one"
          toneClassName="text-blue-600"
          borderClassName="border-blue-500/20"
          backgroundClassName="bg-blue-500/10"
        />
        <PageHeader
          backHref={`/${companyId}`}
          backLabel="Back"
          title={editingId ? "Edit Data" : "Add Data"}
          description={editingId ? "Edit the selected raw source from the list below." : "Store raw URLs, notes, and files with hashtags. Processing happens later."}
        />
      </motion.div>

      <Card>
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
              placeholder="Paste a URL, type a source name, or write notes (one per line)..."
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

            <EntityTagSelector
              value={entityTag}
              onChange={setEntityTag}
              suggestions={entitySuggestions}
              label="About (Entity)"
              placeholder="Which entity is this about? e.g. #nike or #soccer_performance_lab..."
            />

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

      <MetricGrid>
        <MetricCard icon={ScrollText} label="Sources" value={sources.length} />
        <MetricCard icon={FileUp} label="Files" value={items.filter((item) => item.type === "file").length} />
      </MetricGrid>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          All Data ({filteredItems.length}{activeHashtags.length > 0 ? ` of ${items.length}` : ""})
        </h2>
        {filteredItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data yet. Add your first item above.</p>
        ) : (
          <div className="grid gap-4">
            {filteredItems.map((item, index) => {
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
                    hashtags={item.hashtags ?? []}
                    entityTag={(item as any).entityTag ?? null}
                    onStartEdit={() => startEdit(item)}
                    onDelete={() => deleteItem(item)}
                    activeHashtags={activeHashtags}
                    onToggleHashtag={toggleHashtagFilter}
                  />

                  {/* Inject Expert Tip and Team Members at 3rd place (index 1 is after 2nd item) */}
                  {index === 1 && (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="grid gap-4 md:grid-cols-2"
                    >
                      <ExpertTipCard tip={tip} />
                      <MemberList companyId={companyId} isOwner={isOwner} />
                    </motion.div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
