'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain, Eye, TrendingUp, Target, BarChart3, Users, Zap,
  Paintbrush, PenTool, Package, Search, ArrowRight, Activity,
  Bell, CheckCircle2, AlertTriangle, Clock, Beaker, ChevronRight,
  MapPin, Trophy, Dumbbell,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const moduleStatus = [
  { name: "Strategy", path: "/strategy", icon: Brain, health: 92, status: "Configured", color: "text-green-600", description: "Training philosophy, ICP, positioning & growth engine" },
  { name: "Market Intelligence", path: "/intelligence", icon: Search, health: 88, status: "8 competitors tracked", color: "text-green-600", description: "Competitor monitoring, pricing & market signals" },
  { name: "Portfolio & Offerings", path: "/portfolio", icon: Package, health: 76, status: "2 pricing reviews", color: "text-yellow-600", description: "Programs, sessions, camps & membership tiers" },
  { name: "Brand Management", path: "/brand", icon: Paintbrush, health: 78, status: "Brand book draft", color: "text-yellow-600", description: "Brand identity, messaging & visual guidelines" },
  { name: "Digital Presence", path: "/content", icon: PenTool, health: 85, status: "Active", color: "text-green-600", description: "Website, social profiles & content assets" },
  { name: "Lead Generation", path: "/leads", icon: Target, health: 90, status: "3 campaigns", color: "text-green-600", description: "Parent outreach, ads & referral programs" },
  { name: "CRM & Automation", path: "/crm", icon: Users, health: 82, status: "46 active leads", color: "text-green-600", description: "Lead pipeline, follow-ups & enrollment tracking" },
  { name: "Pre-Fortitude AI", path: "/pre-fortitude", icon: Beaker, health: 65, status: "1 experiment", color: "text-gray-500", description: "New program validation & market testing" },
];

const timelineEvents = [
  { text: "Chronis Elite launched new summer camp series — pricing undercuts SPL by 12%", time: "18 min ago", type: "alert" as const, source: "Market Intelligence", icon: AlertTriangle },
  { text: "12 new parent inquiries from Instagram campaign targeting U12 competitive players", time: "1 hour ago", type: "success" as const, source: "Lead Generation", icon: CheckCircle2 },
  { text: "TSF Academy partnered with local club — potential talent pipeline shift", time: "2 hours ago", type: "alert" as const, source: "Market Intelligence", icon: AlertTriangle },
  { text: "Weekly strategy checkpoint due — review training program positioning", time: "3 hours ago", type: "alert" as const, source: "Strategy", icon: Clock },
  { text: "Parent satisfaction survey results: 91% recommend SPL to other families", time: "4 hours ago", type: "success" as const, source: "CRM", icon: CheckCircle2 },
  { text: "Blog post 'Why 1000+ Touches Per Session Matters' gaining traction — 2.4K views", time: "5 hours ago", type: "info" as const, source: "Digital Presence", icon: Activity },
  { text: "Volta Soccer opened new indoor facility 8 miles from SPL — monitor impact", time: "6 hours ago", type: "alert" as const, source: "Market Intelligence", icon: AlertTriangle },
];

const strategicPriorities = [
  { label: "Grow U10–U12 enrollment by 25%", progress: 72, status: "On track" },
  { label: "Launch elite academy pathway program", progress: 38, status: "In progress" },
  { label: "Increase parent referral rate to 40%", progress: 85, status: "Ahead" },
];

const typeStyles = {
  alert: "bg-yellow-50 text-yellow-700 border-yellow-200",
  success: "bg-green-50 text-green-700 border-green-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function Dashboard() {
  const router = useRouter();
  const { company, nbaItems, isLoading, setCompany, setNbaItems, setLoading } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    industry: "",
    description: "",
    targetMarket: "",
    mainGoal: "",
  });

  useEffect(() => {
    fetch("/api/companies")
      .then(res => res.json())
      .then(data => {
        if (data.length > 0) {
          setCompany(data[0]);
          fetchNbaItems(data[0].id);
        }
      })
      .catch(console.error);
  }, []);

  const fetchNbaItems = (companyId: string) => {
    fetch(`/api/nba?companyId=${companyId}`)
      .then(res => res.json())
      .then(setNbaItems)
      .catch(console.error);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      const newCompany = await res.json();
      setCompany(newCompany);
      setShowForm(false);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="container">
        <p>Loading...</p>
      </div>
    );
  }

  if (!company && !showForm) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <motion.div 
          initial={{ opacity: 0, y: -8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.3 }}
          className="flex items-end justify-between"
        >
          <div>
            <h1 className="text-2xl font-bold text-foreground">Welcome to Checklist</h1>
            <p className="text-sm text-muted-foreground mt-1">Set up your company to get started with AI-powered marketing recommendations.</p>
          </div>
        </motion.div>

        <div className="bg-card border border-border rounded-lg shadow-sm p-6 max-w-md">
          <button 
            onClick={() => setShowForm(true)}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Set Up Company
          </button>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <motion.div 
          initial={{ opacity: 0, y: -8 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-2xl font-bold text-foreground">Set Up Your Company</h1>
        </motion.div>

        <div className="bg-card border border-border rounded-lg shadow-sm p-6 max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Company Name</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Industry</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.industry}
                onChange={e => setFormData({ ...formData, industry: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Description</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Target Market</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.targetMarket}
                onChange={e => setFormData({ ...formData, targetMarket: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Main Goal</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.mainGoal}
                onChange={e => setFormData({ ...formData, mainGoal: e.target.value })}
              >
                <option value="">Select a goal</option>
                <option value="GROW_REVENUE">Grow Revenue</option>
                <option value="LAUNCH_PRODUCT">Launch Product</option>
                <option value="ENTER_NEW_MARKET">Enter New Market</option>
                <option value="BUILD_AWARENESS">Build Awareness</option>
                <option value="GENERATE_LEADS">Generate Leads</option>
              </select>
            </div>
            <button type="submit" className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
              Save Company
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1">{company?.name || 'Your Company'} — real-time overview of operations, market, and growth.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-green-600 animate-pulse" />
            All systems operational
          </Badge>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Active Players" value="187" change="+23 this month" changeType="positive" icon={Trophy} delay={0} />
        <MetricCard label="New Inquiries" value="46" change="+31% vs last month" changeType="positive" icon={Target} delay={1} />
        <MetricCard label="Monthly Revenue" value="$38.4K" change="+$6.2K this month" changeType="positive" icon={BarChart3} delay={2} />
        <MetricCard label="Competitor Alerts" value="14" change="3 critical" changeType="negative" icon={Eye} delay={3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Platform Modules</h2>
            <span className="text-xs text-muted-foreground">8 modules</span>
          </div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-card border border-border rounded-lg shadow-sm divide-y divide-border">
            {moduleStatus.map((mod, i) => (
              <motion.div key={mod.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + i * 0.03 }}
                className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => router.push(mod.path)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                    <mod.icon className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{mod.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{mod.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <Badge variant="outline" className={`text-[10px] ${mod.color} border-current/20`}>{mod.status}</Badge>
                  <div className="hidden sm:flex items-center gap-2">
                    <Progress value={mod.health} className="w-16 h-1.5" />
                    <span className="text-[11px] font-medium text-muted-foreground w-7">{mod.health}%</span>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Strategic Priorities</h2>
            <button onClick={() => router.push("/strategy")} className="text-xs text-blue-600 hover:underline">View all</button>
          </div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-card border border-border rounded-lg shadow-sm divide-y divide-border">
            {strategicPriorities.map((p, i) => (
              <div key={i} className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                  <Badge variant="outline" className="text-[10px]">{p.status}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={p.progress} className="flex-1 h-1.5" />
                  <span className="text-[11px] font-medium text-muted-foreground">{p.progress}%</span>
                </div>
              </div>
            ))}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="mt-4 bg-card border border-border rounded-lg shadow-sm p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: "Run weekly checkpoint", icon: Brain, path: "/strategy" },
                { label: "Review competitor alerts", icon: Bell, path: "/intelligence" },
                { label: "Update session pricing", icon: Package, path: "/portfolio" },
              ].map((action) => (
                <button key={action.label} onClick={() => router.push(action.path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors text-left group">
                  <action.icon className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                  {action.label}
                  <ArrowRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Activity Timeline</h2>
          <span className="text-xs text-muted-foreground">Last 24 hours</span>
        </div>
        <div className="bg-card border border-border rounded-lg divide-y divide-border shadow-sm">
          {timelineEvents.map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 + i * 0.04 }}
              className="px-5 py-3.5 flex items-center gap-3">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${typeStyles[item.type]}`}>
                <item.icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground">{item.text}</span>
                <Badge variant="outline" className="text-[9px] ml-2 bg-muted/50 align-middle">{item.source}</Badge>
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">{item.time}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}