'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Settings, 
  Save, 
  RefreshCcw, 
  ShieldCheck, 
  Cpu, 
  Clock, 
  Zap,
  ChevronLeft
} from "lucide-react";
import { 
  PageShell, 
  PageHeader, 
  MetricCard, 
  Notice 
} from "@/components/ui/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";

export default function trinitySettingsPage() {
  const router = useRouter();
  const [config, setConfig] = useState({
    loop_interval_ms: 600000,
    task_min_ice: 50,
    flashcard_min_confidence: 40,
    ollama_timeout_ms: 120000
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchConfig() {
      try {
        const res = await fetch('/api/intelligence/config');
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
        }
      } catch (err) {
        console.error("Failed to fetch config", err);
      } finally {
        setLoading(false);
      }
    }
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/intelligence/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        toast({ title: "Configuration Saved", description: "The engine will apply these settings on its next cycle." });
      } else {
        throw new Error("Failed to save");
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to save configuration.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCcw className="w-8 h-8 animate-spin text-accent" />
      </div>
    );
  }

  return (
    <PageShell width="xl">
      <div className="flex flex-col gap-8">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <PageHeader 
            title="trinity Config" 
            description="Manage engine-wide thresholds and operational intervals."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-accent" />
                <CardTitle className="text-sm font-bold uppercase tracking-tight">Sync Uptime</CardTitle>
              </div>
              <CardDescription className="text-xs">Frequency of the autonomous synthesis loop.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="loop_interval_ms" className="text-[10px] uppercase font-black text-muted-foreground">Sync Gap (ms)</Label>
                <Input 
                  id="loop_interval_ms"
                  type="number" 
                  value={config.loop_interval_ms} 
                  onChange={(e) => setConfig({ ...config, loop_interval_ms: parseInt(e.target.value) })}
                  className="font-mono font-bold"
                />
                <p className="text-[10px] text-muted-foreground italic">Current: {Math.round(config.loop_interval_ms / 60000)} minutes</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2 mb-1">
                <Zap className="h-4 w-4 text-amber-500" />
                <CardTitle className="text-sm font-bold uppercase tracking-tight">Intelligence Thresholds</CardTitle>
              </div>
              <CardDescription className="text-xs">Quality and Impact filters for card generation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="task_min_ice" className="text-[10px] uppercase font-black text-muted-foreground">ICE Floor</Label>
                  <Input 
                    id="task_min_ice"
                    type="number" 
                    value={config.task_min_ice} 
                    onChange={(e) => setConfig({ ...config, task_min_ice: parseInt(e.target.value) })}
                    className="font-mono font-bold"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="flashcard_min_confidence" className="text-[10px] uppercase font-black text-muted-foreground">Confidence (%)</Label>
                  <Input 
                    id="flashcard_min_confidence"
                    type="number" 
                    value={config.flashcard_min_confidence} 
                    onChange={(e) => setConfig({ ...config, flashcard_min_confidence: parseInt(e.target.value) })}
                    className="font-mono font-bold"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="md:col-span-2 border-border/60 shadow-sm bg-zinc-950 text-white">
            <CardHeader className="border-b border-white/5">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="h-4 w-4 text-blue-400" />
                <CardTitle className="text-sm font-bold uppercase tracking-tight">AI Runtime Model Stack</CardTitle>
              </div>
              <CardDescription className="text-xs text-zinc-400">Models are managed via internal core.js stack mapping.</CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <Notice variant="default" title="Note on Model Switching" className="bg-white/5 border-white/10 text-zinc-300">
                The engine uses a failover stack (DRAFT/WRITE/JUDGE). Currently, the stack is optimized for qwen2.5, granite4, and apertus.
              </Notice>
              
              <div className="mt-6 space-y-2">
                <Label htmlFor="ollama_timeout" className="text-[10px] uppercase font-black text-zinc-500">Inference Timeout (ms)</Label>
                <Input 
                  id="ollama_timeout"
                  type="number" 
                  value={config.ollama_timeout_ms} 
                  onChange={(e) => setConfig({ ...config, ollama_timeout_ms: parseInt(e.target.value) })}
                  className="bg-zinc-900 border-white/10 font-mono font-bold text-blue-400"
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-end gap-4 mt-4">
          <Button 
            onClick={handleSave} 
            disabled={saving}
            className="bg-accent hover:bg-accent/90 text-black font-bold px-8 py-6 rounded-xl shadow-xl"
          >
            {saving ? <RefreshCcw className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            COMMIT CONFIGURATION
          </Button>
        </div>
      </div>
    </PageShell>
  );
}
