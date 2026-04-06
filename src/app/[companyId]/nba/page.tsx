'use client';

import { useState, useEffect, useCallback } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Check, X, MessageSquare, Loader2, Share2, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FormInput, FormTextarea } from "@/components/ui/form-fields";
import {
  EmptyState,
  Notice,
  PageHeader,
  PageShell,
} from "@/components/ui/app-shell";

interface NBAItem {
  id: string;
  title: string;
  description: string;
  impact: number;
  confidence: number;
  ease: number;
  iceScore: number;
  status: string;
  userAnnotation?: string;
  createdBy?: string;
}

type ActionMode = "ACCEPT" | "DECLINE" | "MODIFY_ACCEPT";

export default function CompanyNBAPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { company, setCompany } = useStore();
  const [items, setItems] = useState<NBAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMode, setActionMode] = useState<ActionMode | null>(null);
  const [actionItemId, setActionItemId] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadNBA = useCallback(async (cid: string) => {
    setLoading(true);
    const res = await fetch(`/api/nba?companyId=${cid}`);
    const data = await res.json();
    const pending = data.filter((item: NBAItem) => item.status === "PENDING");
    setItems(pending);
    setLoading(false);
  }, []);

  const loadAllNBA = useCallback(async (cid: string) => {
    setLoading(true);
    const res = await fetch(`/api/nba?companyId=${cid}`);
    const data = await res.json();
    setItems(data);
    setLoading(false);
  }, []);

  const reloadPending = useCallback(() => {
    if (company) loadNBA(company.id);
  }, [company, loadNBA]);

  const triggerLocalAI = useCallback(async () => {
    if (!company) return;
    setIsGenerating(true);
    try {
      await fetch("/api/agent/local", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      });
    } catch (error) {
      console.error("Failed to trigger local AI", error);
    } finally {
      setIsGenerating(false);
    }
  }, [company]);

  const handleRefresh = useCallback(async () => {
    if (!company) return;
    setLoading(true);
    await triggerLocalAI();
    await loadNBA(company.id);
  }, [company, loadNBA, triggerLocalAI]);

  useEffect(() => {
    if (!companyId) return;

    const fetchCompany = async (cid: string) => {
      try {
        const companies = await fetch(`/api/companies`).then((res) => res.json());
        const found = companies.find((c: any) => c.id === cid);
        if (!found) {
          router.push("/");
          return;
        }

        setCompany(found);
        await loadNBA(found.id);
      } catch (error) {
        console.error(error);
      }
    };

    fetchCompany(companyId);
  }, [companyId, router, setCompany, loadNBA]);

  useEffect(() => {
    const interval = setInterval(() => {
      reloadPending();
    }, 600000);
    return () => clearInterval(interval);
  }, [reloadPending]);

  const toggleArchived = () => {
    if (showArchived) {
      if (company) loadNBA(company.id);
    } else {
      if (company) loadAllNBA(company.id);
    }
    setShowArchived(!showArchived);
  };

  const handleShare = useCallback(async (item: NBAItem) => {
    const text = `${item.title}\n\n${item.description}\n\nImpact: ${item.impact} | Confidence: ${item.confidence}% | Ease: ${item.ease}\nICE Score: ${Math.round(item.iceScore)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  }, []);

  const resetActionForm = useCallback(() => {
    setActionMode(null);
    setActionItemId(null);
    setAnnotation("");
    setDraftTitle("");
    setDraftDescription("");
  }, []);

  const openActionForm = useCallback((item: NBAItem, mode: ActionMode) => {
    setActionMode(mode);
    setActionItemId(item.id);
    setAnnotation(item.userAnnotation ?? "");
    setDraftTitle(item.title);
    setDraftDescription(item.description);
  }, []);

  const handleFeedback = useCallback(async (
    itemId: string,
    action: ActionMode,
    feedbackAnnotation?: string,
    modifiedTitle?: string,
    modifiedDescription?: string,
  ) => {
    setLoading(true);
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nbaItemId: itemId,
        action,
        annotation: feedbackAnnotation,
        modifiedTitle,
        modifiedDescription,
      }),
    });

    resetActionForm();
    await triggerLocalAI();
    if (company) {
      await loadNBA(company.id);
    } else {
      setLoading(false);
    }
  }, [company, loadNBA, resetActionForm, triggerLocalAI]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === "r" || e.key === "R") {
        void handleRefresh();
      } else if (e.key === "a" || e.key === "A") {
        const pending = items.find((item) => item.status === "PENDING");
        if (pending) {
          void handleFeedback(pending.id, "ACCEPT");
        }
      } else if (e.key === "Escape") {
        resetActionForm();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleFeedback, handleRefresh, items, resetActionForm]);

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <PageShell width="md">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        {isGenerating && (
          <Notice icon={Loader2} title="Generating tasks" className="mb-4">
            AI is generating recommendations.
          </Notice>
        )}
        <PageHeader
          backHref={`/${companyId}`}
          backLabel="Back"
          title="My Tasks"
          description={`${items.length} pending tasks`}
          actions={
            <>
              <Button onClick={handleRefresh} variant="ghost" size="sm" disabled={isGenerating}>
                <Loader2 className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
                {isGenerating ? "Generating..." : "Refresh"}
              </Button>
              <Button onClick={toggleArchived} variant="ghost" size="sm">
                {showArchived ? "Hide Archived" : "Show Archived"}
              </Button>
            </>
          }
        />
      </motion.div>

      {items.length === 0 ? (
        <EmptyState
          icon={Brain}
          title="No recommendations yet"
          description="Add data to get AI-powered suggestions."
        />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 bg-card border border-border rounded-lg ${
                item.status === "ACCEPTED" ? "border-green-500/50" :
                item.status === "DECLINED" ? "border-red-500/50 opacity-50" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium text-foreground">{item.title}</h3>
                    {item.status && (
                      <Badge variant={item.status === "ACCEPTED" ? "default" : "destructive"}>
                        {item.status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                  
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>Impact: {item.impact}</span>
                    <span>Confidence: {item.confidence}%</span>
                    <span>Ease: {item.ease}</span>
                    <span className="font-medium">ICE: {Math.round(item.iceScore)}</span>
                  </div>
                  
                  {item.userAnnotation && (
                    <div className="mt-2 p-2 bg-muted rounded text-sm">
                      <MessageSquare className="w-3 h-3 inline mr-1" />
                      {item.userAnnotation}
                    </div>
                  )}
                </div>
                
                {item.status === "PENDING" && (
                  <div className="flex items-center gap-1">
                    <Button
                      onClick={() => openActionForm(item, "ACCEPT")}
                      variant="ghost"
                      size="icon"
                      title="Accept"
                    >
                      <Check className="w-5 h-5" />
                    </Button>
                    <Button
                      onClick={() => openActionForm(item, "DECLINE")}
                      variant="ghost"
                      size="icon"
                      title="Decline"
                    >
                      <X className="w-5 h-5" />
                    </Button>
                    <Button
                      onClick={() => openActionForm(item, "MODIFY_ACCEPT")}
                      variant="outline"
                      size="sm"
                      title="Modify + accept"
                    >
                      Modify + accept
                    </Button>
                  </div>
                )}
                
                {item.status !== "PENDING" && (
                  <Button
                    onClick={() => handleShare(item)}
                    variant="ghost"
                    size="icon"
                    title="Share"
                  >
                    {copiedId === item.id ? <CheckCircle className="w-5 h-5 text-green-600" /> : <Share2 className="w-5 h-5" />}
                  </Button>
                )}
              </div>
              
              {actionItemId === item.id && actionMode && (
                <div className="mt-3 pt-3 border-t">
                  {actionMode === "MODIFY_ACCEPT" && (
                    <div className="space-y-2">
                      <FormInput
                        label="Adjusted task title"
                        value={draftTitle}
                        onChange={(e) => setDraftTitle(e.target.value)}
                        placeholder="Adjusted task title"
                      />
                      <FormTextarea
                        value={draftDescription}
                        onChange={(e) => setDraftDescription(e.target.value)}
                        placeholder="Adjusted task description"
                      />
                    </div>
                  )}
                  <FormTextarea
                    value={annotation}
                    onChange={(e) => setAnnotation(e.target.value)}
                    placeholder={
                      actionMode === "DECLINE"
                        ? "Why are you declining? (required)"
                        : actionMode === "MODIFY_ACCEPT"
                          ? "Why did you adjust this task? (recommended)"
                          : "Why are you accepting this task? (optional)"
                    }
                  />
                  <div className="flex gap-2 mt-2">
                    <Button
                      onClick={() =>
                        handleFeedback(
                          item.id,
                          actionMode,
                          annotation,
                          actionMode === "MODIFY_ACCEPT" ? draftTitle : undefined,
                          actionMode === "MODIFY_ACCEPT" ? draftDescription : undefined,
                        )
                      }
                      disabled={
                        (actionMode === "DECLINE" && !annotation.trim()) ||
                        (actionMode === "MODIFY_ACCEPT" && (!draftTitle.trim() || !draftDescription.trim()))
                      }
                      variant={actionMode === "DECLINE" ? "destructive" : "default"}
                      size="sm"
                    >
                      {actionMode === "DECLINE"
                        ? "Confirm Decline"
                        : actionMode === "MODIFY_ACCEPT"
                          ? "Save and Accept"
                          : "Confirm Accept"}
                    </Button>
                    <Button onClick={resetActionForm} variant="ghost" size="sm">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </PageShell>
  );
}
