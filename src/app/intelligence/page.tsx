'use client';

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Search, Eye, TrendingUp, AlertTriangle, Globe, ExternalLink, RefreshCw,
  ArrowUpRight, TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

const competitors = [
  {
    name: "RC Performance Training", domain: "rcperform.com", threatLevel: 62,
    focus: "Athlete performance, speed, agility",
    positioning: "Sports performance + technical",
    targetAges: "8-18", location: "Long Island, NY",
    recentChanges: [
      { type: "program", detail: "New speed & agility summer camp", date: "1 day ago", severity: "medium" as const },
    ],
    metrics: { traffic: "+5%", adSpend: "$2K/mo", contentFreq: "4/week", socialGrowth: "+1.2%" },
  },
  {
    name: "Chronis Elite", domain: "chroniselite.com", threatLevel: 78,
    focus: "Elite youth soccer development",
    positioning: "High-end academy-style",
    targetAges: "10-18", location: "NY Metro Area",
    recentChanges: [
      { type: "pricing", detail: "Elite summer showcase $1,200/week", date: "2 days ago", severity: "high" as const },
      { type: "partnership", detail: "MLS Next academy scouts", date: "5 days ago", severity: "high" as const },
    ],
    metrics: { traffic: "+15%", adSpend: "$5K/mo", contentFreq: "6/week", socialGrowth: "+4.1%" },
  },
  {
    name: "TSF Academy", domain: "tsfacademy.com", threatLevel: 74,
    focus: "Elite academy and youth progression",
    positioning: "Pathway-to-academy",
    targetAges: "7-18", location: "NY/NJ Area",
    recentChanges: [
      { type: "program", detail: "New U-10 elite squad", date: "2 days ago", severity: "high" as const },
      { type: "hiring", detail: "Former MLS assistant coach", date: "1 week ago", severity: "high" as const },
    ],
    metrics: { traffic: "+12%", adSpend: "$4K/mo", contentFreq: "5/week", socialGrowth: "+3.4%" },
  },
  {
    name: "Sofive", domain: "sofive.com", threatLevel: 48,
    focus: "Multi-field soccer facilities",
    positioning: "Facility-first, recreational",
    targetAges: "All ages", location: "Multi-location",
    recentChanges: [
      { type: "pricing", detail: "$99/month unlimited membership", date: "1 day ago", severity: "medium" as const },
    ],
    metrics: { traffic: "+10%", adSpend: "$8K/mo", contentFreq: "7/week", socialGrowth: "+2.5%" },
  },
];

const timelineEvents = [
  { text: "Chronis Elite MLS Next partnership", time: "2h ago", type: "partnership" },
  { text: "Sofive $99/mo membership", time: "5h ago", type: "pricing" },
  { text: "TSF Academy hired MLS coach", time: "8h ago", type: "hiring" },
  { text: "RC Performance posted transformation reels", time: "1d ago", type: "content" },
  { text: "Youth soccer +8% in NY tri-state", time: "2d ago", type: "market" },
];

const alerts = [
  { text: "Chronis Elite MLS Next scout partnership - direct threat to elite positioning", severity: "critical", time: "2 hours ago" },
  { text: "TSF Academy hired former MLS assistant coach", severity: "critical", time: "8 hours ago" },
  { text: "Sofive $99/mo unlimited membership", severity: "warning", time: "5 hours ago" },
];

const severityColors = { high: "bg-red-100 text-red-700 border-red-200", medium: "bg-yellow-100 text-yellow-700 border-yellow-200", low: "bg-gray-100 text-gray-600 border-gray-200" };

export default function IntelligencePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("monitoring");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">AI agents monitoring competitors and market signals.</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <RefreshCw className="w-4 h-4 mr-1" /> Refresh Intel
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Competitors Tracked", value: "8", icon: Eye, change: "Active monitoring" },
          { label: "Market Signals (7d)", value: "34", icon: TrendingUp, change: "+12 vs last week" },
          { label: "Critical Alerts", value: "2", icon: AlertTriangle, change: "Action needed" },
          { label: "Customer Segments", value: "4", icon: Eye, change: "All monitored" },
          { label: "Market Growth", value: "8.5%", icon: TrendingUp, change: "CAGR" },
        ].map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">{m.label}</span>
              <m.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-foreground">{m.value}</span>
              <span className="text-xs text-muted-foreground">{m.change}</span>
            </div>
          </div>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-muted flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="monitoring" className="text-xs">Competitor Monitoring</TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs">Activity Timeline</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs">Alerts & Signals</TabsTrigger>
        </TabsList>

        <TabsContent value="monitoring" className="space-y-4 mt-4">
          {competitors.map((comp, i) => (
            <motion.div key={comp.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
              <div className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center"><Globe className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground">{comp.name}</h3>
                      <p className="text-xs text-muted-foreground">{comp.domain} - {comp.location}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground mb-1">Threat Level</p>
                      <div className="flex items-center gap-2">
                        <Progress value={comp.threatLevel} className="w-20 h-1.5" />
                        <span className={`text-xs font-semibold ${comp.threatLevel >= 70 ? "text-red-600" : comp.threatLevel >= 50 ? "text-yellow-600" : "text-green-600"}`}>{comp.threatLevel}%</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/30 rounded-md px-4 py-2.5 mb-4">
                  <p className="text-xs text-foreground">{comp.focus}</p>
                  <p className="text-xs text-muted-foreground">{comp.positioning} - Ages {comp.targetAges}</p>
                </div>

                <div className="grid grid-cols-4 gap-3 mb-4">
                  {[{ label: "Traffic", value: comp.metrics.traffic }, { label: "Ad Spend", value: comp.metrics.adSpend }, { label: "Content", value: comp.metrics.contentFreq }, { label: "Growth", value: comp.metrics.socialGrowth }].map((metric) => (
                    <div key={metric.label} className="bg-muted/50 rounded-md px-3 py-2">
                      <p className="text-xs text-muted-foreground mb-0.5">{metric.label}</p>
                      <p className="text-sm font-semibold text-foreground">{metric.value}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Recent Activity</p>
                  {comp.recentChanges.map((change, j) => (
                    <div key={j} className="flex items-center justify-between py-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={`text-xs px-1.5 py-0 ${severityColors[change.severity]}`}>{change.severity}</Badge>
                        <Badge variant="outline" className="text-xs px-1.5 py-0">{change.type}</Badge>
                        <span className="text-xs text-foreground">{change.detail}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{change.date}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </TabsContent>

        <TabsContent value="timeline" className="mt-4">
          <div className="bg-card border border-border rounded-lg">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground">Market Activity Timeline</h3>
            </div>
            <div className="divide-y divide-border">
              {timelineEvents.map((event, i) => (
                <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                  className="px-5 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" />
                    <span className="text-sm text-foreground">{event.text}</span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{event.time}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <div className="space-y-3">
            {alerts.map((alert, i) => (
              <div key={i} className={`p-4 rounded-lg border-l-4 ${alert.severity === "critical" ? "border-l-red-500 bg-red-50" : "border-l-yellow-500 bg-yellow-50"}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-foreground">{alert.text}</p>
                    <span className="text-xs text-muted-foreground">{alert.time}</span>
                  </div>
                  <Badge variant="outline" className={alert.severity === "critical" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}>
                    {alert.severity}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}