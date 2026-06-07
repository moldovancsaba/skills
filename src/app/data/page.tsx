'use client';
import { Title } from "@/components/ui/typography";

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { usePathname, useRouter } from "next/navigation";
import { IconFileUpload as FileUp, IconPlus as Plus, IconCircleCheck as CheckCircle, IconInfoCircle as Info, IconFileText as FileText, IconTrash as Trash2, IconPencil as Edit2 } from "@/components/gds/icons";
import { 
  Stack, Group, Button, Box, ThemeIcon, Badge, Textarea, FileInput, rem, Center, Loader, Divider, ActionIcon, Tooltip } from "@/components/gds/primitives";
import { EmptyState, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody } from "@/components/ui/unified-card";
import { HashtagInput } from "@/components/ui/hashtag-input";
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
  updatedAt: string;
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
    return (
      <Center h="100vh">
        <Loader color="ingress" />
      </Center>
    );
  }

  return (
    <PageShell width="xl">
      <PageHeader
        title={editingId ? "Edit Data Unit" : "Global Data Collection"}
      />

      <Stack gap="xl">
        <UnifiedCard tone="ingress">
          <UnifiedCardBody>
          <form onSubmit={handleSubmit}>
            <Stack gap="md">
              {editingId && (
                <Notice title="Maintenance Mode: Active Edit">
                  A data unit is currently loaded for modification. Save or cancel to return to ingestion mode.
                </Notice>
              )}
              
              <Textarea
                label="Raw Content Ingress"
                description="Input a URL, source text, or operational notes for AI synthesis."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="https://example.com/strategic-report..."
                minRows={4}
                autosize
              />

              {!editingId && (
                <FileInput
                  label="Binary Ingress"
                  description="Upload strategic documents for contextual harvesting."
                  placeholder="Select files..."
                  multiple
                  value={selectedFiles}
                  onChange={setSelectedFiles}
                  leftSection={<FileUp size={16} />}
                />
              )}

              <HashtagInput
                value={hashtags}
                onChange={setHashtags}
                suggestions={hashtagSuggestions}
                label="Strategic Anchors (Hashtags)"
                placeholder="#market-intelligence, #competitor-audit..."
              />

              <Group justify="flex-end" mt="md">
                {editingId && (
                  <Button variant="subtle" color="gray" onClick={cancelEdit}>
                    Cancel
                  </Button>
                )}
                <Button 
                  type="submit" 
                  color="ingress"
                  leftSection={editingId ? <Edit2 size={16} /> : <Plus size={16} />}
                  disabled={(!input.trim() && selectedFiles.length === 0) || !company}
                >
                  {editingId ? "Update Unit" : "Deploy Source"}
                </Button>
              </Group>
            </Stack>
          </form>
          </UnifiedCardBody>
        </UnifiedCard>

        {saved && (
          <Notice icon={CheckCircle} title="Unit Stored">
            The intelligence unit has been committed to the local buffer. Autonomous synthesis will begin shortly.
          </Notice>
        )}

        {errorMessage && (
          <Notice variant="destructive" title="Ingress Failure">
            {errorMessage}
          </Notice>
        )}

        <Stack gap="md">
          <Group justify="space-between" align="center">
            <Title order={2}>
              Intelligence Inventory ({filteredItems.length}{activeHashtags.length > 0 ? ` of ${items.length}` : ""})
            </Title>
            {activeHashtags.length > 0 && (
              <Button variant="subtle" size="xs" color="gray" onClick={() => {
                setActiveHashtags([]);
                router.replace(pathname, { scroll: false });
              }}>
                Clear Filters
              </Button>
            )}
          </Group>
          
          {filteredItems.length === 0 ? (
            <EmptyState
              icon={FileText}
              tone="ingress"
              title="Inventory empty"
              description="Awaiting first ingress."
            />
          ) : (
            <Stack gap="md">
              {filteredItems.map((item) => (
                <SourceDataCard
                  key={item.id}
                  id={item.id}
                  publicId={item.publicId}
                  name={item.name}
                  type={item.type}
                  hashtags={item.hashtags ?? []}
                  createdAt={item.createdAt}
                  updatedAt={item.updatedAt}
                  onStartEdit={() => startEdit(item)}
                  onDelete={() => deleteItem(item)}
                  activeHashtags={activeHashtags}
                  onToggleHashtag={toggleHashtagFilter}
                />
              ))}
            </Stack>
          )}
        </Stack>
      </Stack>
    </PageShell>
  );
}
