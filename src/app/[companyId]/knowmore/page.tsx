'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain,
  Database,
  Layers3,
  Loader2,
  Search,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  EmptyState,
  MetricCard,
  MetricGrid,
  Notice,
  PageHeader,
  PageShell,
} from "@/components/ui/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { KnowledgeReviewCard } from "@/components/knowledge-review-card";

type Company = {
  id: string;
  name: string;
};

type FlashcardSource = {
  id: string;
  sourceType: "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "FILE" | "AGENT_FOUND";
  sourceId: string;
  sourcePublicId: number | null;
  sourceName: string;
  relationRole: "PRIMARY" | "SUPPORTING" | "MERGED_FROM";
};

type FlashcardAction = {
  id: string;
  action: "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";
  annotation: string | null;
  modifiedTitle: string | null;
  modifiedBody: string | null;
  createdAt: string;
};

type FlashcardCorrection = {
  id: string;
  correctionType: "HIDE" | "MARK_WRONG" | "PIN" | "REQUEST_REFRESH" | "SUPPRESS_SOURCE";
  note: string | null;
  sourceType: FlashcardSource["sourceType"] | null;
  sourceId: string | null;
  sourcePublicId: number | null;
  sourceName: string | null;
  createdAt: string;
};

type Flashcard = {
  id: string;
  publicId: number | null;
  kind:
    | "SUMMARY"
    | "EXPLANATION"
    | "COMPARISON"
    | "NEWS"
    | "CONCLUSION"
    | "EVALUATION"
    | "OPINION"
    | "JUDGMENT"
    | "RECOMMENDATION"
    | "RESEARCH"
    | "FORECAST"
    | "STOCK"
    | "GOSSIP"
    | "PRICE";
  title: string;
  body: string;
  confidence: number;
  impact: number;
  weight: number;
  reviewStatus: "PENDING" | "ACCEPTED" | "DECLINED" | "MODIFIED_ACCEPTED";
  userAnnotation: string | null;
  lastActionAt: string | null;
  refreshedAt: string;
  sources: FlashcardSource[];
  actions: FlashcardAction[];
  corrections: FlashcardCorrection[];
};

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;

    try {
      const data = await response.json();
      if (typeof data?.error === "string") {
        message = data.error;
      }
    } catch {
      // Ignore JSON parsing failures and keep the HTTP-level message.
    }

    throw new Error(message);
  }

  return response.json() as Promise<T>;
}

function sourceLabel(sourceType: FlashcardSource["sourceType"]) {
  switch (sourceType) {
    case "PRODUCT":
      return "Product";
    case "CUSTOMER":
      return "Customer";
    case "COMPETITOR":
      return "Competitor";
    case "FILE":
      return "File";
    case "AGENT_FOUND":
      return "Agent";
  }
}

function actionLabel(action: FlashcardAction["action"] | ActionMode) {
  switch (action) {
    case "ACCEPT":
      return "Accepted";
    case "DECLINE":
      return "Declined";
    case "MODIFY_ACCEPT":
      return "Modified + accepted";
  }
}

function reviewStatusLabel(reviewStatus: Flashcard["reviewStatus"]) {
  switch (reviewStatus) {
    case "PENDING":
      return "Pending";
    case "ACCEPTED":
      return "Accepted";
    case "DECLINED":
      return "Declined";
    case "MODIFIED_ACCEPTED":
      return "Modified + accepted";
  }
}

function reviewStatusClasses(reviewStatus: Flashcard["reviewStatus"]) {
  switch (reviewStatus) {
    case "ACCEPTED":
      return "border-transparent bg-green-100 text-green-700";
    case "DECLINED":
      return "border-transparent bg-red-100 text-red-700";
    case "MODIFIED_ACCEPTED":
      return "border-transparent bg-amber-100 text-amber-700";
    case "PENDING":
      return "border-input bg-background text-foreground";
  }
}

function kindLabel(kind: Flashcard["kind"]) {
  return kind.toLowerCase().replace(/_/g, " ");
}

export default function CompanyKnowMorePage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  const [company, setCompany] = useState<Company | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeFlashcardId, setActiveFlashcardId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionComment, setActionComment] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedBody, setEditedBody] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterKind, setFilterKind] = useState<Flashcard["kind"] | "ALL">("ALL");

  const loadFlashcards = useCallback(async (cid: string) => {
    const cards = await fetchJson<Flashcard[]>(
      `/api/knowmore?companyId=${encodeURIComponent(cid)}`,
    );
    setFlashcards(cards);
  }, []);

  const loadPage = useCallback(async (cid: string) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const companies = await fetchJson<Company[]>("/api/companies");
      const found = companies.find((item) => item.id === cid);
      if (!found) {
        router.push("/");
        return;
      }

      setCompany(found);
      await loadFlashcards(found.id);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [loadFlashcards, router]);

  const triggerLocalAI = useCallback(async (cid: string) => {
    setIsGenerating(true);

    try {
      await fetchJson("/api/agent/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: cid }),
      });
    } catch (error) {
      console.error("Failed to trigger local AI from Knowmore", error);
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const closeActionForm = useCallback(() => {
    setActiveFlashcardId(null);
    setActionMode(null);
    setActionComment("");
    setEditedTitle("");
    setEditedBody("");
  }, []);

  const openActionForm = useCallback((flashcard: Flashcard, mode: ActionMode) => {
    setErrorMessage(null);
    setActiveFlashcardId(flashcard.id);
    setActionMode(mode);
    setActionComment("");
    setEditedTitle(flashcard.title);
    setEditedBody(flashcard.body);
  }, []);

  useEffect(() => {
    if (!companyId) {
      return;
    }

    void loadPage(companyId);
  }, [companyId, loadPage]);

  const filteredFlashcards = useMemo(() => {
    return flashcards.filter((card) => {
      const matchesSearch =
        card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        card.body.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesKind = filterKind === "ALL" || card.kind === filterKind;
      return matchesSearch && matchesKind;
    });
  }, [flashcards, searchQuery, filterKind]);

  const summary = useMemo(() => {
    if (flashcards.length === 0) {
      return {
        total: 0,
        reviewed: 0,
        avgConfidence: 0,
        avgImpact: 0,
        avgWeight: 0,
      };
    }

    const totals = flashcards.reduce(
      (acc, flashcard) => {
        acc.confidence += flashcard.confidence;
        acc.impact += flashcard.impact;
        acc.weight += flashcard.weight;
        if (flashcard.reviewStatus !== "PENDING") {
          acc.reviewed += 1;
        }
        return acc;
      },
      { confidence: 0, impact: 0, weight: 0, reviewed: 0 },
    );

    return {
      total: flashcards.length,
      reviewed: totals.reviewed,
      avgConfidence: Math.round(totals.confidence / flashcards.length),
      avgImpact: Math.round(totals.impact / flashcards.length),
      avgWeight: Math.round(totals.weight / flashcards.length),
    };
  }, [flashcards]);

  const handleActionSubmit = useCallback(async (flashcardId: string) => {
    if (!company || !actionMode) {
      return;
    }

    const trimmedComment = actionComment.trim();
    const trimmedTitle = editedTitle.trim();
    const trimmedBody = editedBody.trim();

    if (actionMode === "DECLINE" && !trimmedComment) {
      setErrorMessage("Decline requires a comment so the system can learn from it.");
      return;
    }

    if (actionMode === "MODIFY_ACCEPT" && (!trimmedTitle || !trimmedBody)) {
      setErrorMessage("Modify and accept requires both a title and a body.");
      return;
    }

    setActingId(flashcardId);
    setErrorMessage(null);

    try {
      await fetchJson("/api/knowmore/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flashcardId,
          action: actionMode,
          annotation: trimmedComment || undefined,
          modifiedTitle: actionMode === "MODIFY_ACCEPT" ? trimmedTitle : undefined,
          modifiedBody: actionMode === "MODIFY_ACCEPT" ? trimmedBody : undefined,
        }),
      });

      closeActionForm();
      await loadFlashcards(company.id);
      await triggerLocalAI(company.id);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [
    actionComment,
    actionMode,
    closeActionForm,
    company,
    editedBody,
    editedTitle,
    loadFlashcards,
    triggerLocalAI,
  ]);

  const handleCorrection = useCallback(async (input: {
    flashcardId: string;
    correctionType: FlashcardCorrection["correctionType"];
    sourceType?: FlashcardSource["sourceType"];
    sourceId?: string;
    sourcePublicId?: number | null;
    sourceName?: string;
  }) => {
    if (!company) {
      return;
    }

    setActingId(input.flashcardId);
    setErrorMessage(null);

    try {
      await fetchJson("/api/knowmore/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: company.id,
          flashcardId: input.flashcardId,
          correctionType: input.correctionType,
          sourceType: input.sourceType,
          sourceId: input.sourceId,
          sourcePublicId: input.sourcePublicId,
          sourceName: input.sourceName,
        }),
      });

      closeActionForm();
      await loadFlashcards(company.id);
      await triggerLocalAI(company.id);
    } catch (error) {
      console.error(error);
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingId(null);
    }
  }, [closeActionForm, company, loadFlashcards, triggerLocalAI]);

  if (loading) {
    return (
      <PageShell width="5xl" className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-80" />
        <div className="grid gap-4 md:grid-cols-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-56" />
        <Skeleton className="h-56" />
      </PageShell>
    );
  }

  return (
    <PageShell width="5xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        {isGenerating && (
          <Notice icon={Loader2} title="Refreshing flashcard influence" className="mb-4">
            The local AI is re-reading flashcard actions for the next NBA pass.
          </Notice>
        )}

        {errorMessage && (
          <Notice variant="destructive" className="mb-4">
            {errorMessage}
          </Notice>
        )}

        <PageHeader
          backHref={`/${companyId}`}
          backLabel="Back"
          title="Knowmore"
          description={`Flashcards and knowledge slices for ${company?.name ?? "this company"}.`}
        />
      </motion.div>

      <MetricGrid>
        <MetricCard
          icon={Database}
          iconClassName="text-blue-500"
          label="Knowledge cards"
          value={summary.total}
          detail="Derived from your structured source data."
        />
        <MetricCard
          icon={Sparkles}
          iconClassName="text-amber-500"
          label="Reviewed cards"
          value={summary.reviewed}
          detail="Cards that already carry user feedback back into the system."
        />
        <MetricCard
          icon={Brain}
          iconClassName="text-violet-500"
          label="Average confidence"
          value={`${summary.avgConfidence}%`}
          detail="Confidence across the current flashcards."
        />
        <MetricCard
          icon={Layers3}
          iconClassName="text-emerald-500"
          label="Average impact / weight"
          value={`${summary.avgImpact} / ${summary.avgWeight}`}
          detail="Current impact and weight across the active card set."
        />
      </MetricGrid>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search knowledge..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "SUMMARY", "RECOMMENDATION", "EVALUATION", "RESEARCH"] as const).map((kind) => (
            <Badge
              key={kind}
              variant={filterKind === kind ? "default" : "outline"}
              className="cursor-pointer px-3 py-1 text-xs transition-colors hover:bg-accent"
              onClick={() => setFilterKind(kind)}
            >
              {kind === "ALL" ? "All types" : kindLabel(kind as Flashcard["kind"])}
            </Badge>
          ))}
        </div>
      </div>

      {filteredFlashcards.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <EmptyState
            icon={Sparkles}
            title={searchQuery || filterKind !== "ALL" ? "No matching knowledge cards" : "Add source data to seed the knowledge layer"}
            description={searchQuery || filterKind !== "ALL" ? "Try adjusting your search or filter to find what you're looking for." : "Knowmore reads from durable flashcard storage. As soon as source data exists, bootstrap flashcards appear here."}
            primaryAction={
              searchQuery || filterKind !== "ALL" ? (
                <Button onClick={() => { setSearchQuery(""); setFilterKind("ALL"); }}>Clear filters</Button>
              ) : (
                <Button asChild>
                  <a href={`/${companyId}/data`}>Open Data</a>
                </Button>
              )
            }
          />
        </motion.div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {filteredFlashcards.map((flashcard, index) => {
            const isActionOpen = activeFlashcardId === flashcard.id && actionMode !== null;
            const isBusy = actingId === flashcard.id;

            return (
              <motion.div
                key={flashcard.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <KnowledgeReviewCard
                  flashcard={flashcard}
                  isActionOpen={isActionOpen}
                  actionMode={actionMode}
                  isBusy={isBusy}
                  isGenerating={isGenerating}
                  actionComment={actionComment}
                  editedTitle={editedTitle}
                  editedBody={editedBody}
                  reviewStatusClasses={reviewStatusClasses}
                  reviewStatusLabel={reviewStatusLabel}
                  kindLabel={kindLabel}
                  sourceLabel={sourceLabel}
                  actionLabel={actionLabel}
                  onOpenAction={openActionForm}
                  onCloseAction={closeActionForm}
                  onActionCommentChange={setActionComment}
                  onEditedTitleChange={setEditedTitle}
                  onEditedBodyChange={setEditedBody}
                  onSubmit={(flashcardId) => void handleActionSubmit(flashcardId)}
                  onCorrection={(input) => void handleCorrection(input)}
                />
              </motion.div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
