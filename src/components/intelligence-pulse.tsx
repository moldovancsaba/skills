"use client";

import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Cpu, History, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
      <Card className="border-border/40 bg-zinc-950/50 backdrop-blur-md">
        <CardHeader className="p-4 pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
              <Zap className="h-3 w-3 text-amber-400" />
              Engine Status
            </CardTitle>
            <Badge variant="outline" className={cn(
              "font-mono text-[10px]",
              isHealthy ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" :
              isWarning ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
              "border-red-500/30 bg-red-500/10 text-red-400"
            )}>
              {isHealthy ? "STABLE" : isWarning ? "DEGRADED" : "CRITICAL"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Total Operations</span>
              <span className="font-mono text-sm font-bold text-white">{data.metrics.total_operations}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Failure Rate</span>
              <span className={cn(
                "font-mono text-sm font-bold",
                isHealthy ? "text-emerald-400" : isWarning ? "text-amber-400" : "text-red-400"
              )}>{data.metrics.failure_rate}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Avg Cycle Time</span>
              <span className="font-mono text-sm font-bold text-zinc-300">{data.metrics.avg_cycle_duration}s</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backlog Intensity */}
      <Card className="border-border/40 bg-zinc-950/50 backdrop-blur-md">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-zinc-500">
            <Cpu className="h-3 w-3 text-blue-400" />
            Intelligence Backlog
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Draft Processing</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-16 rounded-full bg-zinc-800">
                  <div 
                    className="h-full rounded-full bg-blue-500 transition-all duration-500" 
                    style={{ width: `${Math.min(100, (data.metrics.backlog.draft_cards / 50) * 100)}%` }} 
                  />
                </div>
                <span className="font-mono text-xs font-bold text-white">{data.metrics.backlog.draft_cards}</span>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-400">Audit Queue (Judge)</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-16 rounded-full bg-zinc-800">
                  <div 
                    className="h-full rounded-full bg-emerald-500 transition-all duration-500" 
                    style={{ width: `${Math.min(100, (data.metrics.backlog.checked_cards / 200) * 100)}%` }} 
                  />
                </div>
                <span className="font-mono text-xs font-bold text-white">{data.metrics.backlog.checked_cards}</span>
              </div>
            </div>
            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] uppercase font-bold text-zinc-600">Sync Uptime</span>
              <span className="text-[10px] font-mono text-zinc-500">{data.uptime}</span>
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
