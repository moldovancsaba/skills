'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams, usePathname } from "next/navigation";
import { 
  Stack, 
  Group, 
  Text, 
  SegmentedControl, 
  FileButton, 
  Card,
  ScrollArea,
  Box,
  Divider,
  Title,
  Button,
  Badge,
  rem,
  Center,
  Loader,
  ThemeIcon,
  Tooltip,
  ActionIcon,
  Transition
} from "@mantine/core";
import { IconFileUpload as FileUp, IconPlus as Plus, IconCircleCheck as CheckCircle, IconFileText as ScrollText, IconFilter as ListFilter, IconSortAscending as SortAsc, IconUsers as Users, IconPencil as Edit2, IconInfoCircle as Info, IconDatabase as Database } from "@tabler/icons-react";
import { MetricCard, MetricGrid, Notice, PageHeader, PageShell, PipelineAccentHeader, UnifiedGrid } from "@/components/ui/app-shell";
import { FormTextarea } from "@/components/ui/form-fields";
import { HashtagInput } from "@/components/ui/hashtag-input";
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
  intelligenceType?: "INTERNAL" | "COMPETITOR";
  createdAt: string;
  updatedAt: string;
  iceScore?: number;
}

function sortDataItems(items: DataItem[], sortBy: "ICE" | "CREATED" | "UPDATED") {
  return [...items].sort((left, right) => {
    if (sortBy === "ICE") {
      const leftIce = left.iceScore ?? Number.NEGATIVE_INFINITY;
      const rightIce = right.iceScore ?? Number.NEGATIVE_INFINITY;
      if (leftIce !== rightIce) return rightIce - leftIce;
    }

    if (sortBy === "UPDATED") {
      return right.updatedAt.localeCompare(left.updatedAt);
    }

    if (sortBy === "CREATED") {
      return right.createdAt.localeCompare(left.createdAt);
    }

    const leftPublicId = left.publicId ?? Number.MAX_SAFE_INTEGER;
    const rightPublicId = right.publicId ?? Number.MAX_SAFE_INTEGER;

    if (leftPublicId !== rightPublicId) {
      return leftPublicId - rightPublicId;
    }

    return right.createdAt.localeCompare(left.createdAt);
  });
}

export default function CompanyDataPage() {
  const PAGE_SIZE = 12;
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [sourceTotal, setSourceTotal] = useState(0);
  const [sourceHasMore, setSourceHasMore] = useState(false);

  const loadAllData = useCallback(async (cid: string) => {
    const [s, f] = await Promise.all([
      fetch(`/api/sources?companyId=${cid}&limit=${PAGE_SIZE}&offset=0`).then((res) => res.json()),
      fetch(`/api/data-files?companyId=${cid}`).then((res) => res.json()),
    ]);
    const sourceItems = Array.isArray(s) ? s : Array.isArray(s?.items) ? s.items : [];
    setSources(sourceItems);
    setSourceTotal(typeof s?.total === "number" ? s.total : sourceItems.length);
    setSourceHasMore(Boolean(s?.hasMore));
    
    const all = [
      ...sourceItems.map((x: any) => ({ ...x, name: x.content, type: "source" as DataType })),
      ...f.map((x: any) => ({ ...x, type: "file" as DataType })),
    ];
    setItems(all);
    setLoading(false);
  }, [setSources]);

  const loadMoreSources = useCallback(async () => {
    if (!company || !sourceHasMore) return;
    const s = await fetch(`/api/sources?companyId=${company.id}&limit=${PAGE_SIZE}&offset=${sources.length}`).then((res) => res.json());
    const sourceItems = Array.isArray(s?.items) ? s.items : [];
    setSources([...sources, ...sourceItems]);
    setSourceTotal(typeof s?.total === "number" ? s.total : sourceTotal);
    setSourceHasMore(Boolean(s?.hasMore));
    setItems((prev) => [
      ...prev,
      ...sourceItems.map((x: any) => ({ ...x, name: x.content, type: "source" as DataType })),
    ]);
  }, [company, sourceHasMore, sources.length, setSources, sourceTotal]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [activeHashtags, listIntelligenceFilter, sortBy, items.length]);

  useEffect(() => {
    if (!companyId) return;

    const loadCompany = async (cid: string) => {
      try {
        const dashboardRes = await fetch(`/api/companies/${cid}/dashboard`);
        if (!dashboardRes.ok) {
          if (dashboardRes.status === 404 || dashboardRes.status === 403) {
            router.push("/");
          }
          return;
        }

        const dashboard = await dashboardRes.json();
        const found = dashboard?.company;
        if (!found?.id) {
          router.push("/");
          return;
        }

        setCompany(found);
        await loadAllData(found.id);

        const [f, nba, members, sessionRes] = await Promise.all([
          fetch(`/api/data-files?companyId=${cid}`).then((res) => res.json()),
          fetch(`/api/nba?companyId=${cid}`).then((res) => res.json()),
          fetch(`/api/companies/${cid}/members`).then((res) => res.json()),
          fetch("/api/auth/session")
        ]);

        setFileCount(Array.isArray(f) ? f.length : 0);
        setPendingTaskCount(
          Array.isArray(nba)
            ? nba.filter((t: any) => ["DRAFT", "CHECKED", "VERIFIED"].includes(t.processingStatus)).length
            : 0,
        );

        if (sessionRes.ok) {
          const session = await sessionRes.json();
          const myMembership = Array.isArray(members) ? members.find((m: any) => m.email === session.email) : null;
          setIsOwner(myMembership?.role === "OWNER" || myMembership?.role === "SUPERADMIN");
        }
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
        if (!currentItem) throw new Error("Edited item not found");
        
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
        if (!response.ok) throw new Error("Failed to update source");
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
        if (!response.ok) throw new Error("Failed to upload files");
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
        if (!response.ok) throw new Error("Failed to save source");
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
    await fetch(`${endpoint}?id=${item.id}`, { method: "DELETE" });
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
      if (res.ok) loadAllData(company.id);
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
  const visibleItems = sortedItems.slice(0, visibleCount);
  const hasSortableIce = items.some((item) => typeof item.iceScore === "number");

  if (loading) {
    return (
      <Center h="100vh">
        <Loader color="brand" />
      </Center>
    );
  }

  const tip = getDashboardExpertTip({
    companyId,
    productCount: sourceTotal || sources.length,
    customerCount: 0,
    competitorCount: 0,
    fileCount,
    flashcardCount: 0,
    pendingTaskCount,
  });

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PipelineAccentHeader 
          activeKey="data" 
          title="Data Ingress" 
          icon={Database} 
        />
        <Card>
          <form onSubmit={handleSubmit}>
            <Stack gap="lg">
              {editingId && (
                <Notice title="Modification Active">
                  Currently editing an existing evidence unit. Save or cancel to return to ingestion.
                </Notice>
              )}
              
              <FormTextarea
                label="Raw Evidence Details"
                description="Paste strategic content, URLs, or operational updates."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Market intelligence report snippet..."
                minRows={5}
              />

              {!editingId && (
                <Stack gap="xs">
                  <Text>Contextual File Ingress</Text>
                  <Group gap="sm">
                    <FileButton 
                      onChange={(files) => setSelectedFiles(prev => [...prev, ...Array.from(files)])} 
                      accept="*" 
                      multiple
                    >
                      {(props) => (
                        <Button {...props} variant="light" color="brand" leftSection={<FileUp size={16} />}>
                          Upload Documents
                        </Button>
                      )}
                    </FileButton>
                    {selectedFiles.length > 0 && (
                      <Button variant="subtle" color="red" size="xs" onClick={() => setSelectedFiles([])}>
                        Clear Queue ({selectedFiles.length})
                      </Button>
                    )}
                  </Group>
                  {selectedFiles.length > 0 && (
                    <Group gap={6} mt="xs">
                      {selectedFiles.map((file, idx) => (
                        <Badge key={idx} variant="outline" color="gray" size="sm">{file.name}</Badge>
                      ))}
                    </Group>
                  )}
                </Stack>
              )}

              <HashtagInput
                value={hashtags}
                onChange={setHashtags}
                suggestions={hashtagSuggestions}
                label="Strategic Anchors (Hashtags)"
                placeholder="#pricing, #competitor-audit..."
              />

              <Stack gap="xs">
                <Text>Intelligence Classification</Text>
                <SegmentedControl
                  value={intelligenceType}
                  onChange={(value) => setIntelligenceType(value as any)}
                  data={[
                    { label: 'Operating Unit (Internal)', value: 'INTERNAL' },
                    { label: 'Market / Competitor', value: 'COMPETITOR' },
                  ]}
                  color={intelligenceType === 'INTERNAL' ? 'blue' : 'orange'}
                  fullWidth
                />
              </Stack>

              <Group justify="flex-end" mt="md">
                {editingId && (
                  <Button variant="subtle" color="gray" onClick={cancelEdit}>Cancel</Button>
                )}
                <Button type="submit" size="md" leftSection={editingId ? undefined : <Plus size={18} />}>
                  {editingId ? "Save Changes" : "Deploy Evidence"}
                </Button>
              </Group>
            </Stack>
          </form>
        </Card>

        {saved && (
          <Notice icon={CheckCircle} title="Unit Committed">
            Data unit stored in the high-fidelity buffer. Synthesis worker notified.
          </Notice>
        )}

        {errorMessage && (
          <Notice variant="destructive" title="Ingress Error">
            {errorMessage}
          </Notice>
        )}

        <MetricGrid>
          <MetricCard 
            icon={ScrollText} 
            label="Intelligence Units" 
            value={sourceTotal || sources.length} 
            detail="Raw Evidence"
            color="blue"
          />
          <MetricCard 
            icon={FileUp} 
            label="Source Assets" 
            value={items.filter((item) => item.type === "file").length} 
            detail="Binary Data"
            color="teal"
          />
        </MetricGrid>

        <Stack gap="xl">
          <Group justify="space-between" align="center">
            <Group gap="sm">
              <Title order={2}>Inventory</Title>
              <Badge variant="light" color="gray">{filteredItems.length} units</Badge>
            </Group>

            <Group gap="sm">
              <Group gap={4} p={4} style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.03)', 
                borderRadius: 8 
              }}>
                {(["ALL", "INTERNAL", "COMPETITOR"] as const).map((type) => (
                  <Button
                    key={type}
                    variant={listIntelligenceFilter === type ? "light" : "subtle"}
                    size="compact-xs"
                    color={listIntelligenceFilter === type 
                      ? (type === "COMPETITOR" ? "orange" : (type === "INTERNAL" ? "blue" : "gray"))
                      : "gray"
                    }
                    onClick={() => setListIntelligenceFilter(type)}
                  >
                    {type === "ALL" ? "All" : type === "INTERNAL" ? "Unit" : "Market"}
                  </Button>
                ))}
              </Group>

              <Group gap={4} p={4} style={{ 
                backgroundColor: 'rgba(255, 255, 255, 0.03)', 
                borderRadius: 8 
              }}>
                {([ "CREATED", "UPDATED", ...(hasSortableIce ? (["ICE"] as const) : []) ] as const).map((sort) => (
                  <Button
                    key={sort}
                    variant={sortBy === sort ? "light" : "subtle"}
                    size="compact-xs"
                    color="gray"
                    onClick={() => setSortBy(sort)}
                  >
                    {sort}
                  </Button>
                ))}
              </Group>
            </Group>
          </Group>

          {filteredItems.length === 0 ? (
            <Card style={{ borderStyle: 'dashed' }} ta="center">
              <Text size="sm" c="dimmed">No intelligence units match the current filters.</Text>
            </Card>
          ) : (
            <UnifiedGrid>
              {visibleItems.map((item) => (
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
                </React.Fragment>
              ))}
            </UnifiedGrid>
          )}

          <UnifiedGrid cols={{ base: 1, xl: 2 }}>
            <ExpertTipCard tip={tip} />
            <MemberList companyId={companyId} isOwner={isOwner} />
          </UnifiedGrid>

          {(sortedItems.length > visibleItems.length || sourceHasMore) && (
            <Group justify="center">
              <Button
                variant="light"
                color="ingress"
                onClick={async () => {
                  if (visibleCount >= sortedItems.length && sourceHasMore) {
                    await loadMoreSources();
                  }
                  setVisibleCount((current) => current + PAGE_SIZE);
                }}
              >
                Load More Intelligence
              </Button>
            </Group>
          )}
        </Stack>
      </Stack>
    </PageShell>
  );
}
