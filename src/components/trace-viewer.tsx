'use client';

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, FileText, Lightbulb, CheckSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TraceNode {
  id: string;
  type: 'SOURCE' | 'FLASHCARD' | 'TASK';
  title: string;
  timestamp: string;
}

/**
 * INTELLIGENCE TRACE VIEWER (Phase 4)
 * v0.14.0-PRODUCTION
 * 
 * Visualizes the provenance chain of an intelligence unit.
 */
export function TraceViewer({ 
  versionFamilyId, 
  onClose 
}: { 
  versionFamilyId: string; 
  onClose: () => void 
}) {
  const [nodes, setNodes] = useState<TraceNode[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchTrace() {
      setLoading(true);
      try {
        // Fetch all items belonging to this version family
        // In a real implementation, this would be a dedicated /api/trace endpoint
        const res = await fetch(`/api/trace?familyId=${versionFamilyId}`);
        const data = await res.json();
        setNodes(data);
      } catch (e) {
        console.error("Trace fetch failed", e);
      } finally {
        setLoading(false);
      }
    }

    if (versionFamilyId) fetchTrace();
  }, [versionFamilyId]);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }} 
      animate={{ opacity: 1, x: 0 }} 
      exit={{ opacity: 0, x: 20 }}
      className="fixed inset-y-0 right-0 w-96 bg-zinc-950 border-l border-zinc-800 shadow-2xl z-50 p-6 flex flex-col gap-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-white">
          <GitBranch className="w-5 h-5 text-indigo-500" />
          <h2 className="text-lg font-bold tracking-tight">Intelligence Lineage</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-zinc-500 hover:text-white">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-8 relative">
        {/* Connecting Line */}
        <div className="absolute left-4 top-8 bottom-8 w-0.5 bg-zinc-800" />

        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : nodes.map((node, i) => (
          <div key={node.id} className="relative pl-12">
            <div className={`absolute left-0 w-8 h-8 rounded-full flex items-center justify-center z-10 
              ${node.type === 'SOURCE' ? 'bg-zinc-800 text-zinc-400' : 
                node.type === 'FLASHCARD' ? 'bg-amber-500/20 text-amber-500' : 
                'bg-indigo-500/20 text-indigo-500'}`}
            >
              {node.type === 'SOURCE' && <FileText className="w-4 h-4" />}
              {node.type === 'FLASHCARD' && <Lightbulb className="w-4 h-4" />}
              {node.type === 'TASK' && <CheckSquare className="w-4 h-4" />}
            </div>
            
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                {node.type} • {new Date(node.timestamp).toLocaleTimeString()}
              </p>
              <h3 className="text-sm font-semibold text-white leading-tight">
                {node.title}
              </h3>
            </div>
          </div>
        ))}
      </div>

      <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50 text-[11px] text-zinc-500 leading-relaxed">
        This trace visualizes the autonomous transformation from raw market evidence into strategic action cards.
      </div>
    </motion.div>
  );
}
