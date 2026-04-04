'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRouter, useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Brain, Check, X, MessageSquare, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

export default function CompanyNBAPage() {
  const router = useRouter();
  const params = useParams();
  const companyId = params.companyId as string;
  
  const { company, setCompany } = useStore();
  const [items, setItems] = useState<NBAItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeclineForm, setShowDeclineForm] = useState<string | null>(null);
  const [showAcceptForm, setShowAcceptForm] = useState<string | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    if (companyId) {
      loadCompany(companyId);
    }
  }, [companyId]);

  useEffect(() => {
    const interval = setInterval(() => {
      refreshNBA();
    }, 600000);
    return () => clearInterval(interval);
  }, [company]);

  const loadCompany = (cid: string) => {
    fetch(`/api/companies`)
      .then(res => res.json())
      .then(data => {
        const found = data.find((c: any) => c.id === cid);
        if (found) {
          setCompany(found);
          loadNBA(found.id);
        } else {
          router.push("/");
        }
      });
  };

  const loadNBA = async (cid: string) => {
    const res = await fetch(`/api/nba?companyId=${cid}`);
    const data = await res.json();
    const pending = data.filter((item: NBAItem) => item.status === "PENDING");
    setItems(pending);
    setLoading(false);
  };

  const loadAllNBA = async (cid: string) => {
    const res = await fetch(`/api/nba?companyId=${cid}`);
    const data = await res.json();
    setItems(data);
    setLoading(false);
  };

  const refreshNBA = () => {
    if (company) loadNBA(company.id);
  };

  const toggleArchived = () => {
    if (showArchived) {
      if (company) loadNBA(company.id);
    } else {
      if (company) loadAllNBA(company.id);
    }
    setShowArchived(!showArchived);
  };

  const handleFeedback = async (itemId: string, action: "ACCEPT" | "DECLINE", annotation?: string) => {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nbaItemId: itemId, action, annotation }),
    });
    
    setShowDeclineForm(null);
    setShowAcceptForm(null);
    setAnnotation("");
    loadNBA(company!.id);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen"><p>Loading...</p></div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center justify-between">
          <div>
            <a href={`/${companyId}`} className="text-sm text-primary hover:underline">← Back</a>
            <h1 className="text-2xl font-bold text-foreground mt-2">My Tasks</h1>
            <p className="text-sm text-muted-foreground mt-1">{items.length} pending tasks</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={refreshNBA}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Loader2 className="w-4 h-4" />
              Refresh
            </button>
            <button
              onClick={toggleArchived}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {showArchived ? "Hide Archived" : "Show Archived"}
            </button>
          </div>
        </div>
      </motion.div>

      {items.length === 0 ? (
        <div className="text-center py-12 border border-dashed rounded-lg">
          <Brain className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground mb-4">No recommendations yet.</p>
          <p className="text-sm text-muted-foreground">Add data to get AI-powered suggestions.</p>
        </div>
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAcceptForm(item.id)}
                      className="p-2 text-green-600 hover:bg-green-50 rounded"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setShowDeclineForm(item.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}

                {showAcceptForm === item.id && (
                  <div className="mt-3 pt-3 border-t">
                    <textarea
                      value={annotation}
                      onChange={(e) => setAnnotation(e.target.value)}
                      placeholder="Add note (optional)"
                      className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => handleFeedback(item.id, "ACCEPT", annotation)}
                        className="px-3 py-1 bg-green-600 text-white rounded text-sm"
                      >
                        Confirm Done
                      </button>
                      <button
                        onClick={() => { setShowAcceptForm(null); setAnnotation(""); }}
                        className="px-3 py-1 text-muted-foreground text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {showDeclineForm === item.id && (
                <div className="mt-3 pt-3 border-t">
                  <textarea
                    value={annotation}
                    onChange={(e) => setAnnotation(e.target.value)}
                    placeholder="Why are you declining? (required)"
                    className="w-full h-20 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleFeedback(item.id, "DECLINE", annotation)}
                      disabled={!annotation.trim()}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm disabled:opacity-50"
                    >
                      Confirm Decline
                    </button>
                    <button
                      onClick={() => { setShowDeclineForm(null); setAnnotation(""); }}
                      className="px-3 py-1 text-muted-foreground text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}