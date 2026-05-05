'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams, usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { 
  Stack, 
  Group, 
  Text, 
  SegmentedControl, 
  FileButton, 
  Card,
  ScrollArea,
  Box,
  Divider
} from "@mantine/core";
import { FileUp, Plus, CheckCircle, ScrollText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

      <Card id="data-form-container" radius="md" withBorder>
        <Stack gap="md" p="xl">
          <form onSubmit={handleSubmit} className="space-y-6">
            {editingId ? (
              <Notice title="Editing Selected Source">
                You are editing an existing source. Save changes or cancel to return to add mode.
              </Notice>
            ) : null}

            <FormTextarea
              label="Evidence Details"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Paste a URL, type a source name, or write notes..."
              minRows={5}
              size="md"
            />

            {!editingId && (
              <Stack gap="xs">
                <Text size="sm" fw={600}>Evidence Files</Text>
                <Group gap="sm">
                  <FileButton 
                    onChange={(files) => setSelectedFiles(prev => [...prev, ...Array.from(files)])} 
                    accept="*" 
                    multiple
                  >
                    {(props) => (
                      <Button {...props} variant="light" color="brand" leftSection={<FileUp size={16} />}>
                        Choose Files
                      </Button>
                    )}
                  </FileButton>
                  
                  {selectedFiles.length > 0 && (
                    <Button 
                      variant="ghost" 
                      color="red" 
                      size="xs" 
                      onClick={() => setSelectedFiles([])}
                    >
                      Clear ({selectedFiles.length})
                    </Button>
                  )}
                </Group>

                {selectedFiles.length > 0 && (
                  <Group gap={6} mt="xs">
                    {selectedFiles.map((file, idx) => (
                      <Badge 
                        key={`${file.name}-${idx}`} 
                        variant="dot" 
                        color="brand"
                        radius="sm"
                        styles={{ label: { textTransform: 'none' } }}
                      >
                        {file.name}
                      </Badge>
                    ))}
                  </Group>
                )}
              </Stack>
            )}

            <HashtagInput
              value={hashtags}
              onChange={setHashtags}
              suggestions={hashtagSuggestions}
              label="Strategic Taxonomy (Hashtags)"
              placeholder="Add hashtags like #pricing, #competitor, #product"
            />

            <Stack gap="xs">
              <Text size="sm" fw={600}>Intelligence Focus</Text>
              <SegmentedControl
                value={intelligenceType}
                onChange={(value) => setIntelligenceType(value as any)}
                data={[
                  { label: 'My Company', value: 'INTERNAL' },
                  { label: 'Market / Competitor', value: 'COMPETITOR' },
                ]}
                color={intelligenceType === 'INTERNAL' ? 'blue' : 'orange'}
                fullWidth
                size="md"
                radius="md"
              />
              <Text size="xs" c="dimmed">
                {intelligenceType === "INTERNAL" 
                  ? "Insights about your own product, operations, and performance." 
                  : "Insights about market competitors and industry benchmarks. Managed separately."}
              </Text>
            </Stack>

            <Group justify="flex-end" gap="md" mt="xl">
              {editingId && (
                <Button variant="subtle" color="gray" onClick={cancelEdit}>
                  Cancel
                </Button>
              )}
              <Button 
                type="submit" 
                size="md"
                disabled={(!input.trim() && selectedFiles.length === 0) || !company}
                leftSection={editingId ? undefined : <Plus size={18} />}
              >
                {editingId ? "Save Changes" : "Hardened Ingest"}
              </Button>
            </Group>
          </form>
        </Stack>
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
        <MetricCard 
          icon={ScrollText} 
          label="Total Sources" 
          value={sources.length} 
          detail="Ingested Evidence"
          color="blue"
        />
        <MetricCard 
          icon={FileUp} 
          label="Uploaded Files" 
          value={items.filter((item) => item.type === "file").length} 
          detail="Direct Assets"
          color="teal"
        />
      </MetricGrid>

      <Stack gap="xl">
        <Group justify="space-between" align="center">
          <Group gap="sm">
            <Text size="xl" fw={900} lts={-0.5}>All Evidence</Text>
            <Badge variant="light" color="gray" radius="sm">
              {filteredItems.length} {activeHashtags.length > 0 || listIntelligenceFilter !== "ALL" ? `of ${items.length}` : ""}
            </Badge>
          </Group>

          <Group gap="sm">
            {/* Focus Filter */}
            <Group gap={4} p={4} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
              {(["ALL", "INTERNAL", "COMPETITOR"] as const).map((type) => (
                <Button
                  key={type}
                  variant={listIntelligenceFilter === type ? "light" : "subtle"}
                  size="compact-xs"
                  color={listIntelligenceFilter === type 
                    ? (type === "COMPETITOR" ? "orange" : (type === "INTERNAL" ? "blue" : "gray"))
                    : "gray"
                  }
                  px="md"
                  h={28}
                  styles={{ label: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 } }}
                  onClick={() => setListIntelligenceFilter(type)}
                >
                  {type === "ALL" ? "All" : type === "INTERNAL" ? "Internal" : "Market"}
                </Button>
              ))}
            </Group>

            {/* Sort Controls */}
            <Group gap={4} p={4} style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.05)' }}>
              {(["CREATED", "UPDATED", "ICE"] as const).map((sort) => (
                <Button
                  key={sort}
                  variant={sortBy === sort ? "light" : "subtle"}
                  size="compact-xs"
                  color="gray"
                  px="md"
                  h={28}
                  styles={{ label: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 } }}
                  onClick={() => setSortBy(sort)}
                >
                  {sort}
                </Button>
              ))}
            </Group>
          </Group>
        </Group>
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
      </Stack>
    </PageShell>
  );
}
