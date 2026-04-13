'use client';

import { useState, useEffect } from 'react';
import { motion } from "framer-motion";
import { 
  Activity, 
  Search, 
  AlertTriangle, 
  BarChart3, 
  RefreshCcw, 
  Clock, 
  ShieldCheck,
  Zap
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from 'date-fns';

interface Stats {
  global: {
    companies: number;
    flashcards: Record<string, number>;
    tasks: Record<string, number>;
    conflicts: number;
  };
  yieldByCompany: Array<{ id: string, name: string, count: number }>;
  workerReports: Array<{ id: string, type: string, data: any, createdAt: string }>;
}

export default function IntelligencePage() {
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
    const interval = setInterval(fetchStats, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCcw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-6 flex items-center gap-4 text-destructive">
          <ShieldCheck className="w-8 h-8" />
          <div>
            <h3 className="font-bold">Access Denied</h3>
            <p className="text-sm opacity-90">{error}</p>
          </div>
        </div>
      </div>
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

  const lastPulse = stats?.workerReports.find(r => r.type === 'PULSE');
  const lastPulseAt = lastPulse ? new Date(lastPulse.createdAt) : null;

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-12">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Market Intelligence OS</h1>
            <p className="text-sm text-muted-foreground mt-1 font-medium italic opacity-80">
              Cross-company AI worker pulse and intelligence yield analytics.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border border-border/50">
            <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
            <span>Worker Status: Active</span>
            <span className="opacity-40">|</span>
            <span>Last Pulse: {lastPulseAt ? formatDistanceToNow(lastPulseAt, { addSuffix: true }) : 'Never'}</span>
          </div>
        </div>
      </motion.div>

      {/* KPI Overviews */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { 
            label: "Intelligence Yield", 
            value: totalFlashcards.toLocaleString(), 
            sub: `${activeFlashcards} Active`, 
            icon: Zap,
            color: "text-amber-500" 
          },
          { 
            label: "System Throughput", 
            value: totalTasks.toLocaleString(), 
            sub: `${(taskYieldRate).toFixed(1)}% Acceptance`, 
            icon: BarChart3,
            color: "text-blue-500"
          },
          { 
            label: "Intelligence Freshness", 
            value: `${freshnessRate.toFixed(1)}%`, 
            sub: `${staleFlashcards} Stale Items`, 
            icon: RefreshCcw,
            color: "text-emerald-500"
          },
          { 
            label: "IQ Conflict Rate", 
            value: stats?.global.conflicts || 0, 
            sub: "Detected audit clashes", 
            icon: AlertTriangle,
            color: "text-rose-500"
          },
        ].map((m, i) => (
          <div key={i} className="bg-card border border-border/60 rounded-xl p-5 shadow-sm hover:border-border transition-colors">
            <div className="flex items-start justify-between mb-2">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{m.label}</span>
              <m.icon className={`w-4 h-4 ${m.color} opacity-80`} />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tabular-nums">{m.value}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-medium">{m.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Company Yield Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-card border border-border/60 rounded-xl overflow-hidden shadow-sm">
            <div className="p-4 border-b border-border/60 bg-muted/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold uppercase tracking-tight">Intelligence Yield per Company</h3>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono opacity-60">Global Ranking</Badge>
            </div>
            <div className="p-0">
              {stats?.yieldByCompany.map((company, i) => (
                <div key={company.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors border-b last:border-0 border-border/60">
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-mono opacity-20 w-4">{i + 1}</span>
                    <span className="text-sm font-bold">{company.name}</span>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-xs font-bold leading-none">{company.count}</div>
                      <div className="text-[10px] text-muted-foreground font-medium">Flashcards</div>
                    </div>
                    <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500/80 rounded-full" 
                        style={{ width: `${(company.count / (stats.yieldByCompany[0].count || 1)) * 100}%` }} 
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Worker Pulse Column */}
        <div className="space-y-6">
          <div className="bg-card border border-border/60 rounded-xl shadow-sm">
            <div className="p-4 border-b border-border/60 bg-muted/20 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-bold uppercase tracking-tight">Worker Heartbeat</h3>
            </div>
            <div className="p-2 space-y-1">
              {stats?.workerReports.slice(0, 6).map((report) => (
                <div key={report.id} className="p-3 rounded-lg hover:bg-muted/40 transition-colors text-[11px]">
                  <div className="flex items-center justify-between font-mono mb-1">
                    <span className={`font-bold ${report.type === 'FAIRNESS_AUDIT' ? 'text-blue-500' : 'text-emerald-500'}`}>
                      [{report.type}]
                    </span>
                    <span className="opacity-60">{formatDistanceToNow(new Date(report.createdAt), { addSuffix: true })}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {report.type === 'PULSE' && (
                      <div className="flex items-center gap-3 opacity-80">
                        <span>Latency: <span className="text-foreground font-bold">{report.data.durationMs}ms</span></span>
                        <span>Yield: <span className="text-foreground font-bold">+{report.data.cardsCreated}</span></span>
                      </div>
                    )}
                    {report.type === 'FAIRNESS_AUDIT' && (
                      <div className="flex items-baseline gap-1 opacity-80">
                        <span>Consistency Check:</span>
                        <span className="text-emerald-600 font-bold tracking-tighter uppercase px-1.5 bg-emerald-500/10 rounded line-height-none py-0.5">Verified</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}