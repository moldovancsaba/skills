'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain,
  Check,
  Database,
  Layers3,
  Loader2,
  MessageSquare,
  PencilLine,
  Sparkles,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  EmptyState,
  MetricCard,
  MetricGrid,
  Notice,
  PageHeader,
  PageShell,
} from "@/components/ui/app-shell";
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
import { Skeleton } from "@/components/ui/skeleton";

type Company = {
  id: string;
  name: string;
};

type FlashcardSource = {
  id: string;
  sourceType: "PRODUCT" | "CUSTOMER" | "COMPETITOR" | "AGENT_FOUND";
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

      {flashcards.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <EmptyState
            icon={Sparkles}
            title="Add source data to seed the knowledge layer"
            description="Knowmore reads from durable flashcard storage. As soon as source data exists, bootstrap flashcards appear here and later get refined by the local AI pipeline."
            primaryAction={
              <Button asChild>
                <a href={`/${companyId}/data`}>Open Data</a>
              </Button>
            }
            secondaryAction={
              <Button asChild variant="outline">
                <a href={`/${companyId}/nba`}>Open Recommendations</a>
              </Button>
            }
          />
        </motion.div>
      ) : (
        <div className="grid gap-4">
          {flashcards.map((flashcard, index) => {
            const isActionOpen = activeFlashcardId === flashcard.id && actionMode !== null;
            const isBusy = actingId === flashcard.id;

            return (
              <motion.div
                key={flashcard.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.04 }}
              >
                <Card>
                  <CardHeader className="gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        {flashcard.publicId ? `#${flashcard.publicId}` : "pending"}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={reviewStatusClasses(flashcard.reviewStatus)}
                      >
                        {reviewStatusLabel(flashcard.reviewStatus)}
                      </Badge>
                      <Badge variant="outline">Confidence {flashcard.confidence}%</Badge>
                      <Badge variant="outline" className="capitalize">{kindLabel(flashcard.kind)}</Badge>
                      <Badge variant="outline">Impact {flashcard.impact}</Badge>
                      <Badge variant="outline">Weight {flashcard.weight}</Badge>
                    </div>
                    <div>
                      <CardTitle className="text-xl">{flashcard.title}</CardTitle>
                      <CardDescription className="mt-2">
                        Refreshed {new Date(flashcard.refreshedAt).toLocaleDateString()}
                        {flashcard.lastActionAt
                          ? ` • Last reviewed ${new Date(flashcard.lastActionAt).toLocaleDateString()}`
                          : ""}
                      </CardDescription>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <p className="text-sm leading-6 text-foreground">{flashcard.body}</p>

                    {flashcard.userAnnotation && (
                      <div className="rounded-md bg-muted/60 p-3 text-sm text-foreground">
                        <MessageSquare className="mr-2 inline h-4 w-4 align-text-bottom text-muted-foreground" />
                        {flashcard.userAnnotation}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {flashcard.sources.map((source) => (
                        <Badge
                          key={source.id}
                          variant="secondary"
                          className="gap-1 font-normal"
                        >
                          {source.sourcePublicId ? `#${source.sourcePublicId}` : "pending"}{" "}
                          {sourceLabel(source.sourceType)}: {source.sourceName}
                        </Badge>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openActionForm(flashcard, "ACCEPT")}
                        disabled={isBusy || isGenerating}
                      >
                        {isBusy && actionMode === "ACCEPT" && activeFlashcardId === flashcard.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="h-4 w-4" />
                        )}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openActionForm(flashcard, "DECLINE")}
                        disabled={isBusy || isGenerating}
                      >
                        <X className="h-4 w-4" />
                        Decline
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openActionForm(flashcard, "MODIFY_ACCEPT")}
                        disabled={isBusy || isGenerating}
                      >
                        <PencilLine className="h-4 w-4" />
                        Modify + accept
                      </Button>
                    </div>

                    {isActionOpen && (
                      <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
                        <p className="text-sm font-medium text-foreground">
                          {actionLabel(actionMode)} this flashcard
                        </p>

                        {actionMode === "MODIFY_ACCEPT" && (
                          <>
                            <FormInput
                              label="Edited title"
                              value={editedTitle}
                              onChange={(event) => setEditedTitle(event.target.value)}
                              placeholder="Correct the flashcard title"
                            />
                            <FormTextarea
                              label="Edited body"
                              value={editedBody}
                              onChange={(event) => setEditedBody(event.target.value)}
                              placeholder="Correct or refine the flashcard body"
                              className="min-h-[120px]"
                            />
                          </>
                        )}

                        <FormTextarea
                          label={actionMode === "DECLINE" ? "Comment" : "Comment (optional)"}
                          value={actionComment}
                          onChange={(event) => setActionComment(event.target.value)}
                          placeholder={
                            actionMode === "DECLINE"
                              ? "Explain what is wrong, misleading, or not useful"
                              : actionMode === "MODIFY_ACCEPT"
                                ? "Explain why the edit matters"
                                : "Add extra context for the local AI"
                          }
                        />

                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            onClick={() => void handleActionSubmit(flashcard.id)}
                            disabled={isBusy}
                          >
                            {isBusy ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : actionMode === "DECLINE" ? (
                              <X className="h-4 w-4" />
                            ) : actionMode === "MODIFY_ACCEPT" ? (
                              <PencilLine className="h-4 w-4" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            Confirm {actionLabel(actionMode).toLowerCase()}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={closeActionForm}
                            disabled={isBusy}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {flashcard.actions.length > 0 && (
                      <div className="rounded-lg border border-border bg-muted/10 p-4">
                        <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          Recent flashcard actions
                        </p>
                        <div className="space-y-3">
                          {flashcard.actions.map((action) => (
                            <div key={action.id} className="text-sm text-foreground">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline">{actionLabel(action.action)}</Badge>
                                <span className="text-xs text-muted-foreground">
                                  {new Date(action.createdAt).toLocaleString()}
                                </span>
                              </div>
                              {action.annotation && (
                                <p className="mt-1 text-muted-foreground">{action.annotation}</p>
                              )}
                              {action.modifiedTitle && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Edited title: {action.modifiedTitle}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
