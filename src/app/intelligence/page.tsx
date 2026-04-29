'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import { 
  Activity, 
  Search, 
  AlertTriangle, 
  BarChart3, 
  RefreshCcw, 
  Clock, 
  ShieldCheck,
  Zap,
  Cpu,
  Building2,
  GitBranch,
  Layers,
  Terminal,
  ExternalLink
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { formatDistanceToNow } from 'date-fns';
import { 
  PageShell, 
  PageHeader, 
  MetricGrid, 
  MetricCard, 
  Notice,
  UnifiedGrid 
} from "@/components/ui/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Stats {
  global: {
    companies: number;
    flashcards: Record<string, number>;
    tasks: Record<string, number>;
    conflicts: number;
  };
  yieldByCompany: Array<{ id: string, name: string, count: number }>;
  workerReports: Array<{ id: string, type: string, data: any, createdAt: string }>;
  synthesis: {
    state: string;
    stage: string;
    pass: number;
    lastProgressAt: string;
    currentCompany: string | null;
    activeTask: string | null;
    activeModel: string | null;
    cycleCount: number;
    settings?: {
      failsafeModel: string;
      task_min_ice?: number;
      flashcard_min_confidence?: number;
      loop_interval_ms?: number;
    };
    metrics?: {
      totalOpsThisCycle: number;
      companiesCoveredThisCycle: number;
      totalResearchYield: number;
      lastLatency?: number;
      cycleHistory: any[];
    };
  } | null;
}

export default function IntelligencePage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/intelligence/stats');
        if (!response.ok) {
          if (response.status === 403) throw new Error("Forbidden: Superadmin access required");
          throw new Error("Failed to fetch intelligence stats");
        }
        const data = await response.json();
        setStats(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchStats();
    const interval = setInterval(fetchStats, 10000); // Faster refresh for "Control" feel
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <RefreshCcw className="w-8 h-8 animate-spin text-accent" />
          <p className="text-sm font-mono text-muted-foreground animate-pulse">Initializing trinity Interface...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <PageShell width="xl">
        <Notice variant="destructive" title="Access Denied" icon={ShieldCheck}>
          {error}
        </Notice>
      </PageShell>
    );
  }

  const activeFlashcards = stats?.global.flashcards?.ACTIVE || 0;
  const staleFlashcards = stats?.global.flashcards?.STALE || 0;
  const archivedFlashcards = stats?.global.flashcards?.ARCHIVED || 0;
  const totalFlashcards = activeFlashcards + staleFlashcards + archivedFlashcards;
  const freshnessRate = totalFlashcards > 0 ? (activeFlashcards / totalFlashcards) * 100 : 0;

  const totalTasks = Object.values(stats?.global.tasks || {}).reduce((a, b) => a + b, 0);
  const acceptedTasks = stats?.global.tasks?.ACCEPTED || 0;
  const taskYieldRate = totalTasks > 0 ? (acceptedTasks / totalTasks) * 100 : 0;

  const synthesis = stats?.synthesis;
  const isRunning = synthesis?.state === "running";

  return (
    <PageShell width="full" className="max-w-[1600px]">
      <div className="flex flex-col gap-8">
        {/* Header Section */}
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20 font-mono text-[10px] uppercase tracking-widest px-2 py-0.5">
                checklist Mode v0.11.4
              </Badge>
              {isRunning && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold uppercase tracking-tight">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  Live Engine
                </div>
              )}
            </div>
            <h1 className="text-4xl font-black tracking-tighter text-foreground mb-1">
              trinity <span className="text-accent italic font-light">CONTROL</span>
            </h1>
            <p className="text-muted-foreground text-sm font-medium max-w-xl">
              Real-time orchestration of the checklist. Managing cross-company synthesis, research harvesting, and intelligence quality.
            </p>
          </div>

          <div className="flex flex-col items-end gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 border-accent/20 bg-accent/5 hover:bg-accent/10 text-accent font-bold"
              onClick={() => router.push('/intelligence/settings')}
            >
              <Settings className="w-4 h-4" />
              CONFIGURE ENGINE
            </Button>
            <div className="flex items-center gap-2 p-1 bg-muted/30 rounded-lg border border-border/50">
              <div className="px-3 py-1.5 rounded-md bg-background shadow-sm border border-border/50 flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs font-mono font-bold tracking-tight">UPTIME: 100.0%</span>
              </div>
              <div className="px-3 py-1.5 rounded-md bg-background shadow-sm border border-border/50 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-xs font-mono font-bold tracking-tight">LATENCY: {synthesis?.metrics?.lastLatency || 0}ms</span>
              </div>
            </div>
          </div>
        </div>

        {/* Live Engine Status - The requested "Useful" bits */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="lg:col-span-1 bg-zinc-950 border-white/5 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-accent/5 to-transparent opacity-50" />
            <CardHeader className="relative p-5 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-[10px] uppercase font-bold tracking-[0.2em] text-accent/70">Active Model Stack</CardDescription>
                <Cpu className="w-4 h-4 text-accent/50" />
              </div>
              <CardTitle className="text-xl font-bold font-mono tracking-tight text-white mt-1">
                {synthesis?.activeModel || synthesis?.settings?.failsafeModel?.split('|')[0]?.split(':')[1]?.trim() || "llama3.2:3b"}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-5 pt-0">
              <div className="flex flex-col gap-1">
                <p className="text-[10px] font-mono text-zinc-500 truncate" title={synthesis?.settings?.failsafeModel}>
                  {synthesis?.settings?.failsafeModel || "No model config found"}
                </p>
                <div className="flex items-center gap-4 mt-2">
                   <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-black text-zinc-600">ICE Floor</span>
                      <span className="text-xs font-mono font-bold text-accent">{synthesis?.settings?.task_min_ice || 50}</span>
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[9px] uppercase font-black text-zinc-600">Confidence</span>
                      <span className="text-xs font-mono font-bold text-accent">{synthesis?.settings?.flashcard_min_confidence || 40}%</span>
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1 bg-zinc-950 border-white/5 relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent opacity-50" />
            <CardHeader className="relative p-5 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-[10px] uppercase font-bold tracking-[0.2em] text-emerald-500/70">Current Context</CardDescription>
                <Building2 className="w-4 h-4 text-emerald-500/50" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight text-white mt-1 truncate">
                {synthesis?.currentCompany || "Idle Rotation"}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-5 pt-0">
               <div className="space-y-3">
                 <div className="flex items-center gap-2">
                   <div className="h-1.5 flex-1 bg-emerald-500/10 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-emerald-500/50"
                        initial={{ width: 0 }}
                        animate={{ width: isRunning ? "65%" : "0%" }}
                        transition={{ duration: 1, ease: "easeInOut" }}
                      />
                   </div>
                   <span className="text-[10px] font-mono text-emerald-500/70">{isRunning ? "LIVE" : "STANDBY"}</span>
                 </div>
                 <div className="flex flex-col">
                    <span className="text-[9px] uppercase font-black text-zinc-600 mb-0.5">Active Task</span>
                    <span className="text-[11px] font-bold text-zinc-200 line-clamp-1 italic">
                      {synthesis?.activeTask || "Scanning for priorities..."}
                    </span>
                 </div>
               </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1 bg-zinc-950 border-white/5 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-50" />
            <CardHeader className="relative p-5 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-[10px] uppercase font-bold tracking-[0.2em] text-blue-500/70">Workflow Stage</CardDescription>
                <GitBranch className="w-4 h-4 text-blue-500/50" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight text-white mt-1">
                {synthesis?.stage || "IDLE"}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-5 pt-0">
              <div className="flex items-center gap-1.5">
                {['RESEARCH', 'SCRUB', 'WRITE', 'JUDGE', 'SYNC'].map((step, i) => {
                  const isActive = synthesis?.stage?.includes(step) || (step === 'SCRUB' && synthesis?.stage === 'SCRUBBING');
                  return (
                    <div key={step} className={cn(
                      "h-1 flex-1 rounded-full",
                      isActive ? "bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" : "bg-blue-500/10"
                    )} />
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-1 bg-zinc-950 border-white/5 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-50" />
            <CardHeader className="relative p-5 pb-2">
              <div className="flex items-center justify-between">
                <CardDescription className="text-[10px] uppercase font-bold tracking-[0.2em] text-amber-500/70">Cycle Progress</CardDescription>
                <Layers className="w-4 h-4 text-amber-500/50" />
              </div>
              <CardTitle className="text-xl font-bold tracking-tight text-white mt-1">
                Pass {synthesis?.pass || 0}/3
              </CardTitle>
            </CardHeader>
            <CardContent className="relative p-5 pt-0">
               <p className="text-[10px] font-mono text-zinc-500">
                Cycle #{synthesis?.cycleCount || 0} • {synthesis?.lastProgressAt ? formatDistanceToNow(new Date(synthesis.lastProgressAt), { addSuffix: true }) : 'N/A'}
              </p>
              <div className="mt-2 text-[9px] uppercase font-black text-zinc-700 tracking-wider">
                Sync Gap: {Math.round((synthesis?.settings?.loop_interval_ms || 600000) / 60000)}m
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Intelligence KPIs */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard 
            icon={Zap} 
            label="Intelligence Yield" 
            value={totalFlashcards.toLocaleString()} 
            detail={`${activeFlashcards} Active Insights`}
            iconClassName="text-amber-500"
          />
          <MetricCard 
            icon={BarChart3} 
            label="System Throughput" 
            value={totalTasks.toLocaleString()} 
            detail={`${(taskYieldRate).toFixed(1)}% Acceptance Rate`}
            iconClassName="text-blue-500"
          />
          <MetricCard 
            icon={RefreshCcw} 
            label="IQ Freshness" 
            value={`${freshnessRate.toFixed(1)}%`} 
            detail={`${staleFlashcards} Items Pending Refresh`}
            iconClassName="text-emerald-500"
          />
          <MetricCard 
            icon={AlertTriangle} 
            label="Conflict Rate" 
            value={stats?.global.conflicts || 0} 
            detail="Auditor Discrepancies"
            iconClassName="text-rose-500"
          />
        </div>

        {/* Data Yield and Pulse Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <Card className="border-border/60 shadow-sm overflow-hidden h-full">
              <CardHeader className="bg-muted/20 border-b border-border/60 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-bold uppercase tracking-tight flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-500" />
                    Yield Distribution
                  </CardTitle>
                  <CardDescription className="text-[10px]">Active intelligence count per organization</CardDescription>
                </div>
                <Badge variant="secondary" className="font-mono text-[10px]">N={stats?.yieldByCompany.length}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border/60">
                  {stats?.yieldByCompany.map((company, i) => (
                    <div key={company.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-mono text-muted-foreground w-4">{i + 1}</span>
                        <span className="text-sm font-bold tracking-tight">{company.name}</span>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right min-w-[60px]">
                          <div className="text-xs font-black tabular-nums">{company.count}</div>
                          <div className="text-[9px] text-muted-foreground uppercase font-bold tracking-tighter">Insights</div>
                        </div>
                        <div className="w-32 h-1.5 bg-muted/50 rounded-full overflow-hidden hidden sm:block">
                          <motion.div 
                            className="h-full bg-accent/80 rounded-full" 
                            initial={{ width: 0 }}
                            animate={{ width: `${(company.count / (stats.yieldByCompany[0]?.count || 1)) * 100}%` }}
                            transition={{ duration: 1, delay: i * 0.05 }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-1">
             <Card className="border-border/60 shadow-sm h-full bg-zinc-950 text-zinc-100">
              <CardHeader className="bg-white/5 border-b border-white/5 p-4 flex flex-row items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-500" />
                  <CardTitle className="text-sm font-bold uppercase tracking-tight">Worker Heartbeat</CardTitle>
                </div>
                <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
              </CardHeader>
              <CardContent className="p-2 pt-4">
                <div className="space-y-2">
                  <AnimatePresence initial={false}>
                    {stats?.workerReports.slice(0, 8).map((report, i) => (
                      <motion.div 
                        key={report.id} 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className={cn(
                            "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                            report.type === 'PULSE' ? 'bg-emerald-500/20 text-emerald-400' : 
                            report.type === 'FAIRNESS_AUDIT' ? 'bg-blue-500/20 text-blue-400' : 
                            report.type === 'DLQ_EXILE' ? 'bg-rose-500/20 text-rose-400' : 'bg-white/10'
                          )}>
                            {report.type}
                          </span>
                          <span className="text-[10px] text-zinc-500 font-mono">
                            {formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}
                          </span>
                        </div>
                        <div className="text-[11px] font-mono leading-relaxed text-zinc-400">
                           {report.type === 'PULSE' && (
                             <div className="grid grid-cols-2 gap-2">
                               <span>DUR: <span className="text-white">{report.data.durationMs}ms</span></span>
                               <span>OPS: <span className="text-white">+{report.data.totalOps || report.data.cardsCreated || 0}</span></span>
                             </div>
                           )}
                           {report.type === 'FAIRNESS_AUDIT' && (
                             <div className="flex items-center gap-2">
                               <ShieldCheck className="w-3 h-3 text-emerald-500" />
                               <span>CONSISTENCY VERIFIED</span>
                             </div>
                           )}
                           {report.type === 'DLQ_EXILE' && (
                             <div className="text-rose-400/80">
                               <span>ID: {report.data.cardId?.slice(0, 8)}...</span>
                               <p className="mt-1 opacity-70 italic line-clamp-1">{report.data.reason}</p>
                             </div>
                           )}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PageShell>
  );
}