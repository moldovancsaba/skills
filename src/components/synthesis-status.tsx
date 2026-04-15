'use client';

import React, { useState, useEffect } from "react";
import { Activity, Brain, ShieldCheck, Database, RefreshCw, Zap, Sparkles, Settings as SettingsIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * SOVEREIGN SYSTHESIS STATUS COMPONENT
 * v0.11.3-PRODUCTION
 * 
 * Provides real-time visibility into the autonomous Trinity Synthesis Engine.
 * Shared across all primary intelligence layers (Data, Topics, Knowmore, Checklist).
 */

type WorkerState = {
  online: boolean;
  state: string;
  stage?: string;
  pass?: number;
  currentCompany?: string;
};

interface SynthesisStatusProps {
  initialState?: WorkerState;
  pollInterval?: number; // ms
}

export function SynthesisStatus({ initialState, pollInterval = 10000 }: SynthesisStatusProps) {
  const [state, setState] = useState<WorkerState>(initialState || { online: false, state: "offline", stage: "IDLE" });

  useEffect(() => {
    // If initialState is provided, we use it, but we still poll to keep it ubiquitous across navigation
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/intelligence/worker-status");
        if (res.ok) {
          const data = await res.json();
          setState(data);
        } else {
          setState({ online: false, state: "offline", stage: "IDLE" });
        }
      } catch (e) {
        setState({ online: false, state: "offline", stage: "IDLE" });
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, pollInterval);
    return () => clearInterval(interval);
  }, [pollInterval]);

  if (!state.online) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-900/40 px-3 py-1.5 grayscale opacity-50">
        <Activity className="h-3 w-3 text-zinc-500" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Offline</span>
      </div>
    );
  }

  const isIdle = state.state === "idle";
  
  const stageMap: Record<string, { label: string; icon: any; color: string; glow: string }> = {
    IDLE: { label: "Resting", icon: Zap, color: "text-amber-500", glow: "bg-amber-500" },
    SCHEDULING: { label: "Scheduling", icon: RefreshCw, color: "text-blue-500", glow: "bg-blue-500" },
    ORBITING: { label: "Orbiting", icon: Activity, color: "text-indigo-500", glow: "bg-indigo-500" },
    SCRUBBING: { label: "Scrubbing", icon: Database, color: "text-cyan-500", glow: "bg-cyan-500" },
    WRITING: { label: "Synthesizing", icon: Brain, color: "text-green-500", glow: "bg-green-500" },
    JUDGING: { label: "Judging", icon: ShieldCheck, color: "text-violet-500", glow: "bg-violet-500" },
    ASCENDING: { label: "Ascending", icon: Sparkles, color: "text-fuchsia-500", glow: "bg-fuchsia-500" },
    MAINTENANCE: { label: "Maintenance", icon: SettingsIcon, color: "text-zinc-400", glow: "bg-zinc-400" },
  };

  const current = stageMap[state.stage || "IDLE"] || stageMap.IDLE;
  const Icon = current.icon;

  return (
    <div className="group relative flex items-center gap-3 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 transition-all hover:border-zinc-600 hover:bg-zinc-900/80">
      <div className="relative flex h-2 w-2 items-center justify-center">
        <motion.div 
          className={cn("h-full w-full rounded-full", isIdle ? "bg-amber-500" : "bg-green-500")}
          animate={isIdle ? {} : { scale: [1, 1.3, 1] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
        {!isIdle && (
          <div className="absolute inset-0 animate-ping rounded-full bg-green-500 opacity-40" />
        )}
      </div>
      
      <div className="flex items-center gap-2 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={state.stage}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            className="flex items-center gap-1.5"
          >
            <Icon className={cn("h-3 w-3", current.color)} />
            <span className="whitespace-nowrap text-[10px] font-bold uppercase tracking-widest text-zinc-300">
              {current.label}
              {!isIdle && state.pass !== undefined && state.pass > 0 && (
                <span className="ml-1 opacity-50">v{state.pass}</span>
              )}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Floating Tooltip / Details */}
      <div className="pointer-events-none absolute -bottom-1 left-1/2 flex min-w-[160px] -translate-x-1/2 translate-y-full flex-col gap-1 rounded-lg border border-zinc-800 bg-zinc-950 p-2 opacity-0 transition-opacity group-hover:opacity-100 z-50 shadow-2xl">
        <div className="text-[9px] uppercase tracking-tighter text-zinc-500">Active Synthesis Engine</div>
        {state.currentCompany ? (
          <div className="flex items-center gap-1 text-[11px] font-medium text-zinc-200">
            <Zap className="h-2 w-2 text-amber-500" />
            {state.currentCompany}
          </div>
        ) : (
          <div className="text-[11px] font-medium text-zinc-400 italic">No active orbit</div>
        )}
        <div className="mt-1 h-[2px] w-full overflow-hidden rounded-full bg-zinc-900">
          <motion.div 
            className={cn("h-full", current.glow)}
            animate={isIdle ? { width: "100%" } : { width: ["0%", "100%"] }}
            transition={isIdle ? {} : { duration: 3, repeat: Infinity }}
          />
        </div>
      </div>
    </div>
  );
}
