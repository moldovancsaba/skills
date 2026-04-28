'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, HardHat, Save } from "lucide-react";

import { PageHeader, PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardHeader, UnifiedCardBody, UnifiedCardActions } from "@/components/ui/unified-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FormInput } from "@/components/ui/form-fields";

export default function ReviewDashboard() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Load items needing review directly from API
  useEffect(() => {
    fetchItems();
  }, [companyId]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      // In a real implementation we would fetch Flashcards and Tasks with processingStatus: 'REVIEW'
      // Since this is Axiom Phase 5 implementation and we haven't built the explicit /api yet,
      // we'll fetch from standard API's and filter locally for now.
      const [fcRes, nbaRes] = await Promise.all([
        fetch(`/api/flashcards?companyId=${companyId}`),
        fetch(`/api/nba?companyId=${companyId}`)
      ]);
      
      const [fcData, nbaData] = await Promise.all([
        fcRes.ok ? fcRes.json() : [],
        nbaRes.ok ? nbaRes.json() : []
      ]);

      const merged = [
        ...(Array.isArray(fcData) ? fcData : []).filter(item => item.processingStatus === "REVIEW"),
        ...(Array.isArray(nbaData) ? nbaData : []).filter(item => item.processingStatus === "REVIEW")
      ].map(item => ({...item, _type: item.kind === 'TASK' ? 'TASK' : 'FLASHCARD'}));

      setItems(merged);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleScoreUpdate = async (id: string, type: 'TASK'|'FLASHCARD', newC: number, newI: number, newE_W: number) => {
    setSavingId(id);
    try {
      if (type === 'TASK') {
        const ice = newI * newC * newE_W;
        await fetch(`/api/nba?id=${id}`, {
          method: "PATCH",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            confidenceScore: newC,
            confidence: newC,
            impact: newI,
            ease: newE_W,
            iceScore: ice,
            processingStatus: "CHECKED" // Return to pipeline Axiom 2
          })
        });
      } else {
        await fetch(`/api/flashcards?id=${id}`, {
          method: "PATCH",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            confidenceScore: newC,
            confidence: newC,
            impact: newI,
            weight: newE_W,
            processingStatus: "CHECKED" 
          })
        });
      }
      // Remove from list
      setItems(prev => prev.filter(i => i.id !== id));
    } catch(e) {
      console.error("Save failed", e);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <PageShell width="7xl" className="space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4">
        <PageHeader 
          title="Axiom Review Gateway" 
          description="Resolve intelligence items where the AI elected not to assign strict mathematical scoring parameters. You must supply a 1-10 boundary score for each item to return it to autonomous flow." 
        />
      </motion.div>

      {loading ? (
         <div className="space-y-4">
           <Skeleton className="h-[200px] w-full rounded-2xl" />
           <Skeleton className="h-[200px] w-full rounded-2xl" />
         </div>
      ) : items.length === 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center p-12 text-center border border-zinc-800 border-dashed rounded-3xl bg-zinc-900/20">
          <HardHat className="w-12 h-12 text-zinc-600 mb-4" />
          <h3 className="text-lg font-bold text-white tracking-tight">No Anomalies Detected</h3>
          <p className="text-zinc-400 mt-2 max-w-sm">The trinity engine is successfully grading all intelligence inside the established Axioms.</p>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence>
            {items.map(item => (
              <ReviewEditorCard key={item.id} item={item} onSave={handleScoreUpdate} isSaving={savingId === item.id} />
            ))}
          </AnimatePresence>
        </div>
      )}
    </PageShell>
  );
}

function ReviewEditorCard({ item, onSave, isSaving }: { item: any; onSave: any, isSaving: boolean }) {
  const [c, setC] = useState("1");
  const [i, setI] = useState("1");
  const [ew, setEW] = useState("1"); // Ease or Weight

  const metricLabel = item._type === 'TASK' ? 'Ease' : 'Weight';

  return (
    <motion.div layout initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.95}}>
      <UnifiedCard className="border-amber-500/30">
        <UnifiedCardHeader 
          title={item.title} 
          supporting={
            <div className="flex gap-2">
              <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full uppercase">Review Required</span>
              <span className="text-[10px] font-mono text-zinc-500 uppercase">{item._type}</span>
            </div>
          }
        />
        <UnifiedCardBody>
          <p className="text-sm text-zinc-300 line-clamp-4 bg-zinc-900/50 p-3 rounded-lg border border-zinc-800/50">
            {item.body || item.description}
          </p>

          <div className="grid grid-cols-3 gap-2 mt-4">
             <FormInput label="Impact [1-10]" type="number" min="1" max="10" value={i} onChange={e=>setI(e.target.value)} />
             <FormInput label="Confidence [1-10]" type="number" min="1" max="10" value={c} onChange={e=>setC(e.target.value)} />
             <FormInput label={`${metricLabel} [1-10]`} type="number" min="1" max="10" value={ew} onChange={e=>setEW(e.target.value)} />
          </div>

          <UnifiedCardActions className="mt-4">
            <Button onClick={() => onSave(item.id, item._type, parseInt(c), parseInt(i), parseInt(ew))} disabled={isSaving} className="w-full bg-amber-500 hover:bg-amber-600 text-amber-950 font-bold">
              {isSaving ? "Injecting Axiom..." : "Confirm & Return to Pipeline"}
              <Save className="w-4 h-4 ml-2" />
            </Button>
          </UnifiedCardActions>
        </UnifiedCardBody>
      </UnifiedCard>
    </motion.div>
  );
}
