'use client';

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FormInput } from "@/components/ui/form-fields";
import { Notice, PageHeader, PageShell, PipelineAccentHeader } from "@/components/ui/app-shell";

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
    <PageShell width="5xl">
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
      />

      {message ? (
        <Notice title="Saved">
          {message}
        </Notice>
      ) : null}

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="flex gap-2">
            <FormInput
              label="Add topic"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="trending, pricing, retention, market landscape analysis..."
            />
            <Button type="button" className="self-end" onClick={() => void addTopic()}>
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {orderedTopics.map((topic, index) => (
          <Card
            key={topic.id}
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
            className={draggingId === topic.id ? "opacity-60" : undefined}
          >
            <CardContent className="flex items-center gap-4 p-4">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <span className="w-8 text-sm font-mono text-muted-foreground">{index + 1}</span>
              <Checkbox checked={topic.active} onCheckedChange={() => void toggleActive(topic)} />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-foreground">{topic.label}</p>
                <p className="text-sm text-muted-foreground">
                  {topic.active ? "Active research focus" : "Inactive"}
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  if (index === 0) return;
                  void persistOrder(reorder(orderedTopics, index, index - 1));
                }}>
                  Up
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => {
                  if (index === orderedTopics.length - 1) return;
                  void persistOrder(reorder(orderedTopics, index, index + 1));
                }}>
                  Down
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void removeTopic(topic)}>
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {orderedTopics.length === 0 ? (
          <p className="text-sm text-muted-foreground">No topics yet. Add your first research focus above.</p>
        ) : null}
      </div>
    </PageShell>
  );
}
