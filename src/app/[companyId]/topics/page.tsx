/**
 * TOPICS FOCUS PAGE
 * v0.11.3-PRODUCTION
 * 
 * Implements Unified Page Architecture:
 * - PageShell: Full-Width Layout
 * - UnifiedGrid: 3-Column Desktop Display
 */
'use client';

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GripVertical, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FormInput } from "@/components/ui/form-fields";
import { Notice, PageHeader, PageShell, PipelineAccentHeader, UnifiedGrid } from "@/components/ui/app-shell";
import { 
  UnifiedCard, 
  UnifiedCardHeader, 
  UnifiedCardBody, 
  UnifiedCardActions, 
  UnifiedCardText 
} from "@/components/ui/unified-card";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SynthesisStatus } from "@/components/synthesis-status";

type Topic = {
  id: string;
  companyId: string;
  label: string;
  active: boolean;
  sortOrder: number;
  notes?: string | null;
};

type Company = {
  id: string;
  name: string;
};

async function fetchTopicsPageData(companyId: string) {
  const [companiesRes, topicsRes] = await Promise.all([
    fetch("/api/companies").then((res) => res.json()),
    fetch(`/api/topics?companyId=${companyId}`).then((res) => res.json()),
  ]);

  return {
    company: Array.isArray(companiesRes)
      ? companiesRes.find((item: Company) => item.id === companyId) ?? null
      : null,
    topics: Array.isArray(topicsRes) ? topicsRes : [],
  };
}

function reorder<T>(items: T[], from: number, to: number) {
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

export default function CompanyTopicsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadPage = useCallback(async () => {
    const { company: found, topics: nextTopics } = await fetchTopicsPageData(companyId);
    if (!found) {
      router.push("/");
      return;
    }

    setCompany(found);
    setTopics(nextTopics);
    setLoading(false);
  }, [companyId, router]);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;

    async function initializePage() {
      const { company: found, topics: nextTopics } = await fetchTopicsPageData(companyId);
      if (cancelled) return;
      if (!found) {
        router.push("/");
        return;
      }

      setCompany(found);
      setTopics(nextTopics);
      setLoading(false);
    }

    void initializePage();
    return () => {
      cancelled = true;
    };
  }, [companyId, router]);

  const persistOrder = useCallback(async (nextTopics: Topic[]) => {
    setTopics(nextTopics);
    await Promise.all(
      nextTopics.map((topic, index) =>
        fetch(`/api/topics?id=${topic.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sortOrder: index }),
        }),
      ),
    );
  }, []);

  const addTopic = useCallback(async () => {
    const label = draft.trim();
    if (!label) return;

    await fetch("/api/topics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, label }),
    });

    setDraft("");
    setMessage(`Added topic "${label}"`);
    await loadPage();
  }, [companyId, draft, loadPage]);

  const toggleActive = useCallback(async (topic: Topic) => {
    await fetch(`/api/topics?id=${topic.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !topic.active }),
    });
    setTopics((current) =>
      current.map((item) => (item.id === topic.id ? { ...item, active: !item.active } : item)),
    );
  }, []);

  const removeTopic = useCallback(async (topic: Topic) => {
    if (!confirm(`Delete topic "${topic.label}"?`)) return;
    await fetch(`/api/topics?id=${topic.id}`, { method: "DELETE" });
    await loadPage();
  }, [loadPage]);

  const orderedTopics = useMemo(
    () => [...topics].sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label)),
    [topics],
  );

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="full">
      <PipelineAccentHeader
        activeKey="topics"
        title="Topics"
        icon="looks_two"
        toneClassName="text-orange-600"
        borderClassName="border-orange-500/20"
        backgroundClassName="bg-orange-500/10"
      />
      <PageHeader
        backHref={`/${companyId}`}
        backLabel="Back"
        title="Topics"
        description={`Prioritized research focus topics for ${company?.name ?? "this company"}. Drag to reorder, use the checkbox to activate or pause.`}
        actions={<SynthesisStatus />}
      />

      {message ? (
        <Notice title="Saved">
          {message}
        </Notice>
      ) : null}

      <UnifiedCard className="mb-8">
        <UnifiedCardHeader title="Add New Research Topic" />
        <UnifiedCardBody className="space-y-4">
          <div className="flex gap-2">
            <FormInput
              label="Topic Label"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="e.g., market landscape analysis, pricing strategy, trending..."
            />
            <Button 
              type="button" 
              className="self-end h-10 px-6 font-bold uppercase tracking-widest text-[10px]" 
              onClick={() => void addTopic()}
            >
              <Plus className="h-4 w-4" />
              Add Topic
            </Button>
          </div>
        </UnifiedCardBody>
      </UnifiedCard>

      <div className="mb-4">
        <h2 className="text-lg font-bold tracking-tight text-white">Focus topics ({orderedTopics.length})</h2>
        <p className="text-sm text-zinc-500">Drag to reorder or use the buttons below.</p>
      </div>

      <UnifiedGrid>
        {orderedTopics.map((topic, index) => {
          const badges = (
            <>
              <Badge variant="outline" className="font-mono text-[10px] tracking-wider border-zinc-200/20 text-zinc-400">
                {index + 1}
              </Badge>
              <Badge variant="secondary" className={cn(
                "font-mono text-[10px] tracking-wider border-zinc-200/20",
                topic.active ? "bg-green-500/10 text-green-400" : "bg-zinc-800 text-zinc-500"
              )}>
                {topic.active ? "ACTIVE" : "PAUSED"}
              </Badge>
            </>
          );

          return (
            <motion.div
              key={topic.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.03 }}
              draggable
              onDragStart={() => setDraggingId(topic.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (!draggingId || draggingId === topic.id) return;
                const from = orderedTopics.findIndex((item) => item.id === draggingId);
                const to = orderedTopics.findIndex((item) => item.id === topic.id);
                if (from < 0 || to < 0) return;
                void persistOrder(reorder(orderedTopics, from, to));
                setDraggingId(null);
              }}
              onDragEnd={() => setDraggingId(null)}
              className={cn(
                "group cursor-grab active:cursor-grabbing",
                draggingId === topic.id && "opacity-60"
              )}
            >
              <UnifiedCard>
                <UnifiedCardHeader 
                  supporting={badges} 
                  title={topic.label} 
                />
                
                <UnifiedCardBody>
                  <div className="flex items-center gap-3 mb-4">
                    <Checkbox 
                      checked={topic.active} 
                      onCheckedChange={() => void toggleActive(topic)} 
                      className="h-5 w-5 border-zinc-700 data-[state=checked]:bg-orange-500 data-[state=checked]:border-orange-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Research Focus</p>
                      <p className="text-sm text-zinc-300">
                        {topic.active ? "Actively processing strategic intelligence" : "Research paused"}
                      </p>
                    </div>
                  </div>

                  <UnifiedCardActions>
                    <div className="flex w-full items-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 border-zinc-200/10 hover:bg-zinc-200/5 text-zinc-400" 
                        onClick={() => {
                          if (index === 0) return;
                          void persistOrder(reorder(orderedTopics, index, index - 1));
                        }}
                        disabled={index === 0}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-8 border-zinc-200/10 hover:bg-zinc-200/5 text-zinc-400" 
                        onClick={() => {
                          if (index === orderedTopics.length - 1) return;
                          void persistOrder(reorder(orderedTopics, index, index + 1));
                        }}
                        disabled={index === orderedTopics.length - 1}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </Button>
                      
                      <div className="ml-auto flex items-center gap-2">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                          <GripVertical className="h-4 w-4 text-zinc-600" />
                        </div>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 text-zinc-500 hover:text-red-400" 
                          onClick={() => void removeTopic(topic)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </UnifiedCardActions>
                </UnifiedCardBody>
              </UnifiedCard>
            </motion.div>
          );
        })}
      </UnifiedGrid>

      {orderedTopics.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">No topics yet. Add your first research focus above.</p>
      ) : null}
    </PageShell>
  );
}
