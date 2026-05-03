"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { 
  Bell, 
  ShieldCheck, 
  Key, 
  Settings as SettingsIcon, 
  Copy, 
  RefreshCcw, 
  Eye, 
  EyeOff,
  MessageSquare,
  Mail,
  Smartphone,
  Webhook,
  Globe,
  Languages
} from "lucide-react";
import { PageHeader, PageShell } from "@/components/ui/app-shell";
import { LanguageSelector } from "@/components/LanguageSelector";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/components/ui/use-toast";
import { motion } from "framer-motion";

type CommunicationSettings = {
  isEnabled: boolean;
  channel: string;
  handle: string;
  minIceScore: number;
  bridgeSecret: string;
};

type CompanySettings = {
  id: string;
  name: string;
  allowedLanguages: string[];
};

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params.companyId as string;

  const [settings, setSettings] = useState<CommunicationSettings | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecret, setShowSecret] = useState(false);

  const fetchSettings = useCallback(async () => {
    try {
      const [commRes, companyRes] = await Promise.all([
        fetch(`/api/communication/settings?companyId=${companyId}`),
        fetch(`/api/companies/${companyId}/settings`)
      ]);
      
      if (commRes.ok) {
        setSettings(await commRes.json());
      }
      if (companyRes.ok) {
        setCompanySettings(await companyRes.json());
      }
    } catch (error) {
      console.error("Failed to load settings", error);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (companyId) fetchSettings();
  }, [companyId, fetchSettings]);

  const saveSettings = async (updates: Partial<CommunicationSettings>) => {
    if (!settings) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/communication/settings?companyId=${companyId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...settings, ...updates }),
      });
      if (res.ok) {
        setSettings(await res.json());
        toast({ title: "Settings saved", description: "Communication preferences updated successfully." });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save settings.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveCompanySettings = async (updates: Partial<CompanySettings>) => {
    if (!companySettings) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...companySettings, ...updates }),
      });
      if (res.ok) {
        setCompanySettings(await res.json());
        toast({ title: "Organization saved", description: "Language and organization settings updated." });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to save organization settings.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const regenerateSecret = async () => {
    if (!confirm("Regenerating the secret will break existing bridge integrations. Continue?")) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/communication/settings?companyId=${companyId}&action=regenerate-secret`, {
        method: "POST",
      });
      if (res.ok) {
        setSettings(await res.json());
        toast({ title: "Secret regenerated", description: "A new Bridge API Key has been issued." });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to regenerate secret.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: "Copied to clipboard." });
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center"><p>Loading...</p></div>;
  if (!settings) return <div className="flex min-h-screen items-center justify-center"><p>Error: Settings not found.</p></div>;

  return (
    <PageShell width="xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <PageHeader 
          title="Communication Settings" 
          description="Manage AI alerts and the two-way communication bridge."
          backHref={`/${companyId}`}
        />
      </motion.div>

      <div className="grid gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-12">
          {/* Global Alerting Control */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <Card className="border-accent/10 bg-accent/5 backdrop-blur-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="space-y-1">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Bell className="h-5 w-5 text-accent" />
                    Alerting Layer
                  </CardTitle>
                  <CardDescription className="text-muted-foreground/80">Enable or disable automated AI discoveries and task alerts.</CardDescription>
                </div>
                <Switch 
                  checked={settings.isEnabled} 
                  onCheckedChange={(checked) => saveSettings({ isEnabled: checked })}
                  disabled={saving}
                />
              </CardHeader>
            </Card>
          </motion.div>

          {/* Organization Settings */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}>
            <Card className="border-accent/10 bg-accent/5 backdrop-blur-md relative overflow-hidden">
              <div className="absolute top-0 right-0 p-8 opacity-5">
                <Globe className="h-32 w-32" />
              </div>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-accent/10">
                    <Languages className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Language Management</CardTitle>
                    <CardDescription className="text-muted-foreground/80">Define which languages the AI is allowed to use for intelligence synthesis.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6 relative z-10">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-foreground/80">Allowed Languages</Label>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-tighter border-accent/20 bg-accent/5">
                      {companySettings?.allowedLanguages.length || 0} Enabled
                    </Badge>
                  </div>
                  
                  <LanguageSelector 
                    selectedIds={companySettings?.allowedLanguages || []}
                    onChange={(ids) => {
                      if (companySettings) {
                        setCompanySettings({ ...companySettings, allowedLanguages: ids });
                      }
                    }}
                    disabled={saving}
                  />
                  
                  <div className="flex justify-end">
                    <Button 
                      onClick={() => saveCompanySettings({ allowedLanguages: companySettings?.allowedLanguages })}
                      disabled={saving || !companySettings}
                      className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-xs uppercase tracking-widest shadow-lg shadow-accent/20"
                    >
                      {saving ? "Saving..." : "Apply Language Policy"}
                    </Button>
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-accent/10 bg-background/50 backdrop-blur-sm">
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-3">Policy Enforcement</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    AI agents will strictly use only these permitted languages for <span className="text-foreground font-medium underline decoration-accent/30 underline-offset-4">flashcards</span> and <span className="text-foreground font-medium underline decoration-accent/30 underline-offset-4">taskcards</span>. 
                    <span className="block mt-3 font-bold text-foreground/90">checklist Purity Check:</span> Any content detected in a disallowed language or containing mixed-language structures will be <span className="text-destructive font-bold underline decoration-destructive/30 underline-offset-4 uppercase tracking-tight">deleted immediately</span> during synthesis to ensure knowledge base integrity.
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Channel Configuration */}
            <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-muted-foreground" />
                    Notification Channel
                  </CardTitle>
                  <CardDescription>Choose where the AI sends high-impact alerts.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Channel</Label>
                    <Select 
                      value={settings.channel} 
                      onValueChange={(val) => saveSettings({ channel: val })}
                      disabled={saving}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="IMESSAGE">iMessage</SelectItem>
                        <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
                        <SelectItem value="EMAIL">Email</SelectItem>
                        <SelectItem value="WEBHOOK">Webhook</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Handle / URL</Label>
                    <div className="flex gap-2">
                      <Input 
                        value={settings.handle || ""} 
                        onChange={(e) => setSettings({ ...settings, handle: e.target.value })}
                        placeholder={settings.channel === 'EMAIL' ? 'email@example.com' : '+123456789'}
                      />
                      <Button variant="outline" size="sm" onClick={() => saveSettings({ handle: settings.handle })}>Save</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Threshold Configuration */}
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                    Sensitivity & Priority
                  </CardTitle>
                  <CardDescription>Only items meeting this threshold will trigger a notification.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Minimum ICE Score</Label>
                      <span className="text-sm font-mono font-bold text-accent">{settings.minIceScore}</span>
                    </div>
                    <Slider 
                      value={[settings.minIceScore]} 
                      min={0} 
                      max={1000} 
                      step={10} 
                      onValueChange={(val) => setSettings({ ...settings, minIceScore: val[0] })}
                      onValueCommit={(val) => saveSettings({ minIceScore: val[0] })}
                      disabled={saving}
                    />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                      Higher score = Fewer, higher-quality notifications.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Two-Way Bridge Security */}
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Key className="h-5 w-5 text-muted-foreground" />
                  Communication Bridge API
                </CardTitle>
                <CardDescription>Use this key to send data into checklist memory from external scripts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 truncate font-mono text-sm">
                      {showSecret ? settings.bridgeSecret : "•".repeat(36)}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => setShowSecret(!showSecret)}>
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => copyToClipboard(settings.bridgeSecret)}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={regenerateSecret} disabled={saving}>
                        <RefreshCcw className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Endpoint</Label>
                    <div className="flex items-center gap-2 rounded-md border bg-muted/10 p-2 text-xs font-mono">
                       {typeof window !== 'undefined' ? window.location.origin : ''}/api/bridge/ingress
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">Example Payload</Label>
                    <div className="rounded-md border bg-muted/80 p-2 text-[10px] font-mono text-muted">
                      {`{ "secret": "...", "sender": "+123", "text": "New market insight..." }`}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </PageShell>
  );
}
