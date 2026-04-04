'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain, Target, BarChart3, Users, Package, Search, ArrowRight,
  Clock, Bell, ChevronRight, Info,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";

const moduleStatus = [
  { name: "Strategy", path: "/strategy", icon: Brain, health: 0, status: "Coming soon", color: "text-muted-foreground", description: "Strategic planning and priority tracking" },
  { name: "Market Intelligence", path: "/intelligence", icon: Search, health: 0, status: "Coming soon", color: "text-muted-foreground", description: "Competitor monitoring and market signals" },
  { name: "Portfolio & Offerings", path: "/portfolio", icon: Package, health: 0, status: "Coming soon", color: "text-muted-foreground", description: "Programs and pricing management" },
  { name: "Brand Management", path: "/brand", icon: Bell, health: 0, status: "Coming soon", color: "text-muted-foreground", description: "Brand identity and messaging" },
  { name: "Digital Presence", path: "/content", icon: Target, health: 0, status: "Coming soon", color: "text-muted-foreground", description: "Website and content management" },
  { name: "Lead Generation", path: "/leads", icon: BarChart3, health: 0, status: "Coming soon", color: "text-muted-foreground", description: "Campaigns and lead tracking" },
  { name: "CRM & Automation", path: "/crm", icon: Users, health: 0, status: "Coming soon", color: "text-muted-foreground", description: "Pipeline and customer management" },
  { name: "Pre-Fortitude AI", path: "/pre-fortitude", icon: Clock, health: 0, status: "Coming soon", color: "text-muted-foreground", description: "Program validation and testing" },
];

export default function Dashboard() {
  const router = useRouter();
  const { company, isLoading, setCompany, setLoading } = useStore();
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
        }
      })
      .catch(console.error);
  }, []);

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
              <label className="text-sm font-medium">Company Name</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium">Industry</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.industry}
                onChange={e => setFormData({ ...formData, industry: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea
                className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Target Market</label>
              <input
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={formData.targetMarket}
                onChange={e => setFormData({ ...formData, targetMarket: e.target.value })}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Main Goal</label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            <button type="submit" className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2">
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
          <p className="text-sm text-muted-foreground mt-1">{company?.name || 'Your Company'} — overview of your marketing operations.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse" />
            Database required
          </Badge>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Metric 1" value="--" change="Coming soon" changeType="neutral" icon={BarChart3} delay={0} />
        <MetricCard label="Metric 2" value="--" change="Coming soon" changeType="neutral" icon={Target} delay={1} />
        <MetricCard label="Metric 3" value="--" change="Coming soon" changeType="neutral" icon={Users} delay={2} />
        <MetricCard label="Metric 4" value="--" change="Coming soon" changeType="neutral" icon={Search} delay={3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Platform Modules</h2>
            <span className="text-xs text-muted-foreground">Set up database to enable</span>
          </div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-card border border-border rounded-lg shadow-sm divide-y divide-border">
            {moduleStatus.map((mod, i) => (
              <motion.div key={mod.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 + i * 0.03 }}
                className="px-5 py-3.5 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer group"
                onClick={() => router.push(mod.path)}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <mod.icon className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{mod.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{mod.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-shrink-0">
                  <Badge variant="outline" className={`text-[10px] ${mod.color} border-current/20`}>{mod.status}</Badge>
                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Strategic Priorities</h2>
          </div>
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-card border border-border rounded-lg shadow-sm p-5">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="w-4 h-4" />
              <span className="text-sm">Connect database to enable</span>
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="mt-4 bg-card border border-border rounded-lg shadow-sm p-5">
            <h3 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h3>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Info className="w-4 h-4" />
              <span className="text-sm">Coming soon</span>
            </div>
          </motion.div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Activity Timeline</h2>
        </div>
        <div className="bg-card border border-border rounded-lg shadow-sm p-6">
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Info className="w-4 h-4" />
            <span className="text-sm">Connect database to enable activity tracking</span>
          </div>
        </div>
      </div>
    </div>
  );
}