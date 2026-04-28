"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Cpu, History, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from 'date-fns';

type HealthData = {
  status: string;
  uptime: string;
  timestamp: string;
  metrics: {
    total_cycles: number;
    avg_cycle_duration: string;
    total_operations: number;
    failure_rate: string;
    backlog: {
      draft_cards: number;
      checked_cards: number;
    };
    cycleHistory?: Array<{
      timestamp: string;
      ops: number;
      duration: string;
      failRate: string;
    }>;
  };
  errorStats?: {
    attempts: number;
    failures: number;
    rate: string;
    streak: number;
  };
};

export function IntelligencePulse() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/intelligence/health");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Pulse fetch failed", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return null;
  if (!data || data.status === "OFFLINE") {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-red-200">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <div className="text-sm">
          <p className="font-bold">Intelligence Engine Offline</p>
          <p className="opacity-70">The background worker is not responding. Knowledge synthesis is paused.</p>
        </div>
      </div>
    );
  }

  const failRate = parseFloat(data.metrics.failure_rate);
  const isHealthy = failRate < 10;
  const isWarning = failRate >= 10 && failRate < 20;
  const isCritical = failRate >= 20;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Real-time Status */}
      <Card className="border-border/40 bg-zinc-950/50 backdrop-blur-md relative overflow-hidden group">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
              <Zap className="h-3 w-3 text-amber-400" />
              Engine Pulse
            </CardTitle>
            <Badge variant="outline" className={cn(
              "font-mono text-[10px]",
              isHealthy ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
              isWarning ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
              "border-red-500/30 bg-red-500/10 text-red-400"
            )}>
              {data.status === "ONLINE" ? "LIVE" : "OFFLINE"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2 relative">
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Active Context</span>
                <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[120px]">{(data as any).activeModel || (data as any).settings?.failsafeModel?.split('|')[0]?.split(':')[1]?.trim() || "N/A"}</span>
              </div>
              <p className="text-sm font-bold text-white truncate">{(data as any).currentCompany || "Idle Rotation"}</p>
              <p className="text-[10px] text-zinc-500 italic truncate mt-0.5">
                {(data as any).activeTask || "Waiting for signal..."}
              </p>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-tight">Workflow Stage</span>
                <span className="text-[10px] font-mono text-emerald-500 font-bold">{(data as any).stage}</span>
              </div>
              <div className="flex items-center gap-1">
                {['RESEARCH', 'SCRUB', 'WRITE', 'JUDGE'].map((s) => (
                  <div key={s} className={cn(
                    "h-1 flex-1 rounded-full",
                    (data as any).stage?.includes(s) || (s === 'SCRUB' && (data as any).stage === 'SCRUBBING')
                      ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.4)]" 
                      : "bg-zinc-800"
                  )} />
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Throughput Intensity */}
      <Card className="border-border/40 bg-zinc-950/50 backdrop-blur-md">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Cpu className="h-3 w-3 text-blue-400" />
            Throughput Yield
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Cycle Operations</span>
              <span className="font-mono text-sm font-bold text-white">{data.metrics.total_operations}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Backlog Volume</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-16 rounded-full bg-zinc-800">
                  <div 
                    className="h-full rounded-full bg-blue-500 transition-all duration-500" 
                    style={{ width: `${Math.min(100, (data.metrics.backlog.draft_cards / 50) * 100)}%` }} 
                  />
                </div>
                <span className="font-mono text-xs font-bold text-white">{data.metrics.backlog.draft_cards + data.metrics.backlog.checked_cards}</span>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] uppercase font-bold text-zinc-600">Last Sync</span>
              <span className="text-[10px] font-mono text-zinc-500">{data.timestamp ? formatDistanceToNow(new Date(data.timestamp), { addSuffix: true }) : 'N/A'}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cycle History */}
      <Card className="border-border/40 bg-zinc-950/50 backdrop-blur-md">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <History className="h-3 w-3 text-violet-400" />
            Recent Performance
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {data.metrics.cycleHistory && data.metrics.cycleHistory.length > 0 ? (
            <div className="flex h-16 items-end gap-1.5 pt-2">
              {data.metrics.cycleHistory.slice(-10).map((cycle, i) => {
                const height = Math.max(10, Math.min(100, (cycle.ops / 10) * 100));
                const fail = parseFloat(cycle.failRate);
                return (
                  <div 
                    key={i} 
                    className={cn(
                      "flex-1 rounded-t-sm transition-all hover:opacity-80",
                      fail < 10 ? "bg-emerald-500/40" : fail < 20 ? "bg-amber-500/40" : "bg-red-500/40"
                    )}
                    style={{ height: `${height}%` }}
                    title={`Cycle: ${cycle.ops} ops, ${cycle.failRate}% fail`}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex h-16 items-center justify-center text-[10px] text-zinc-600 italic">
              Initializing history...
            </div>
          )}
          <div className="mt-2 flex items-center justify-between text-[9px] font-bold uppercase tracking-tight text-zinc-500">
            <span>Last 10 Cycles</span>
            <span className="flex items-center gap-1">
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Success
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
