'use client';

import { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Brain, Target, BarChart3, Users, Package, Search, ArrowRight,
  Clock, Bell, ChevronRight, CheckCircle, XCircle, AlertCircle, Plus,
  TrendingUp, TrendingDown, Minus, Lightbulb, AlertTriangle, Info,
} from "lucide-react";
import MetricCard from "@/components/MetricCard";
import { Badge } from "@/components/ui/badge";

interface NBAItem {
  id: string;
  title: string;
  description: string | null;
  iceScore: number;
  status: string;
}

interface LearningInsight {
  type: "pattern" | "recommendation" | "warning";
  title: string;
  description: string;
  confidence: number;
}

interface FeedbackAnalytics {
  overview: {
    totalItems: number;
    itemsWithFeedback: number;
    accepted: number;
    declined: number;
    pending: number;
    overallAcceptanceRate: string;
  };
  recommendationTypeStats: {
    type: string;
    accepted: number;
    declined: number;
    total: number;
    acceptanceRate: number;
  }[];
  declinePatterns: {
    pattern: string;
    count: number;
    examples: string[];
  }[];
  trends: {
    sevenDayAcceptanceRate: string;
    thirtyDayAcceptanceRate: string;
    avgAcceptedIceScore: string;
    avgDeclinedIceScore: string;
  };
  insights: LearningInsight[];
}

const moduleStatus = [
  { name: "Data Collection", path: "/data", icon: Plus, description: "Add products, customers, competitors" },
  { name: "Strategy", path: "/strategy", icon: Brain, description: "Strategic planning" },
  { name: "Intelligence", path: "/intelligence", icon: Target, description: "Market insights" },
  { name: "Lead Gen", path: "/leads", icon: BarChart3, description: "Lead generation" },
  { name: "CRM", path: "/crm", icon: Users, description: "Customer management" },
  { name: "Portfolio", path: "/portfolio", icon: Package, description: "Offerings" },
  { name: "Content", path: "/content", icon: Search, description: "Content creation" },
  { name: "Brand", path: "/brand", icon: Bell, description: "Brand management" },
];

export default function Dashboard() {
  const router = useRouter();
  const { company, isLoading, setCompany, setLoading, products, customers, competitors, setProducts, setCustomers, setCompetitors } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [nbaItems, setNbaItems] = useState<NBAItem[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);
  const [showClientSelect, setShowClientSelect] = useState(false);
  const [analytics, setAnalytics] = useState<FeedbackAnalytics | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
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
        setCompanies(data);
        if (data.length > 0) {
          setCompany(data[0]);
        }
      })
      .catch(console.error);
  }, []);

  const switchClient = (companyId: string) => {
    const selected = companies.find(c => c.id === companyId);
    if (selected) {
      setCompany(selected);
      setShowClientSelect(false);
      // Reset data
      setProducts([]);
      setCustomers([]);
      setCompetitors([]);
      setNbaItems([]);
      // Load new data
      fetch(`/api/products?companyId=${companyId}`).then(r => r.json()).then(setProducts);
      fetch(`/api/customers?companyId=${companyId}`).then(r => r.json()).then(setCustomers);
      fetch(`/api/competitors?companyId=${companyId}`).then(r => r.json()).then(setCompetitors);
      fetch(`/api/nba?companyId=${companyId}`).then(r => r.json()).then(d => setNbaItems(d.slice(0, 3)));
    }
  };

  useEffect(() => {
    if (company) {
      fetch(`/api/nba?companyId=${company.id}`)
        .then(res => res.json())
        .then(data => setNbaItems(data.slice(0, 3)))
        .catch(console.error);
      
      fetch(`/api/feedback/analytics?companyId=${company.id}`)
        .then(res => res.json())
        .then(data => setAnalytics(data))
        .catch(console.error);
    }
  }, [company]);

  const handleFeedback = async (nbaItemId: string, action: string, annotation?: string) => {
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nbaItemId,
          action,
          annotation: annotation || null,
        }),
      });
      // Refresh NBA items
      if (company) {
        const res = await fetch(`/api/nba?companyId=${company.id}`);
        setNbaItems((await res.json()).slice(0, 3));
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    console.log("Creating company:", formData);
    
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      
      console.log("Response status:", res.status);
      const data = await res.json();
      console.log("Response data:", data);
      
      if (res.ok) {
        setCompany(data);
        setShowForm(false);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading) {
    return <div className="container"><p>Loading...</p></div>;
  }

  if (!company && !showForm) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <h1 className="text-2xl font-bold text-foreground">Welcome to Checklist</h1>
          <p className="text-sm text-muted-foreground mt-1">Set up your company to get AI-powered marketing recommendations.</p>
        </motion.div>
        <div className="flex gap-3">
          <button onClick={() => setShowForm(true)} className="bg-primary text-primary-foreground px-4 py-2 rounded-md">Set Up Company</button>
          <a href="/" className="px-4 py-2 text-muted-foreground hover:text-foreground border border-border rounded-md">Select Existing Company</a>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-foreground">Set Up Your Company</h1>
        <div className="bg-card border border-border rounded-lg shadow-sm p-6 max-w-md">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Company Name</label>
              <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div>
              <label className="text-sm font-medium">Industry</label>
              <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.industry} onChange={e => setFormData({ ...formData, industry: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Description</label>
              <textarea className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
            </div>
            <div>
              <label className="text-sm font-medium">Target Market</label>
              <input className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.targetMarket} onChange={e => setFormData({ ...formData, targetMarket: e.target.value })} />
            </div>
            <button type="submit" disabled={isLoading} className="bg-primary text-primary-foreground px-4 py-2 rounded-md disabled:opacity-50">
              {isLoading ? "Saving..." : "Save Company"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Command Center</h1>
          {companies.length > 1 ? (
            <button 
              onClick={() => setShowClientSelect(!showClientSelect)}
              className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mt-1"
            >
              {company?.name} ▼
            </button>
          ) : (
            <p className="text-sm text-muted-foreground mt-1">{company?.name}</p>
          )}
        </div>
        <Badge variant="outline" className="gap-1.5 py-1 px-3 text-xs font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Active
        </Badge>
      </motion.div>

      {/* Client Selector Dropdown */}
      {showClientSelect && companies.length > 1 && (
        <div className="absolute right-8 mt-2 bg-card border border-border rounded-lg shadow-lg z-50 w-64">
          {companies.map((c: any) => (
            <button
              key={c.id}
              onClick={() => switchClient(c.id)}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-muted ${
                company?.id === c.id ? "bg-muted font-medium" : ""
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Data Collection Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard label="Products" value={String(products.length)} change={`${products.length} added`} changeType="neutral" icon={Package} delay={0} />
        <MetricCard label="Customers" value={String(customers.length)} change={`${customers.length} added`} changeType="neutral" icon={Users} delay={1} />
        <MetricCard label="Competitors" value={String(competitors.length)} change={`${competitors.length} added`} changeType="neutral" icon={Search} delay={2} />
      </div>

      {/* Next Best Actions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Next Best Actions</h2>
          <button 
            onClick={async () => {
              if (!company) return;
              await fetch("/api/brain", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ companyId: company.id }),
              });
              const res = await fetch(`/api/nba?companyId=${company.id}`);
              setNbaItems((await res.json()).slice(0, 3));
            }}
            className="flex items-center gap-2 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90"
          >
            <Brain className="w-3 h-3" />
            Generate
          </button>
        </div>
        
        {nbaItems.length === 0 ? (
          <div className="bg-card border border-border rounded-lg shadow-sm p-6">
            <div className="text-center text-muted-foreground">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="font-medium">No recommendations yet</p>
              <p className="text-sm mt-1 mb-4">Add data, then click Generate to get AI suggestions.</p>
              <button 
                onClick={async () => {
                  if (!company) return;
                  await fetch("/api/brain", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ companyId: company.id }),
                  });
                  const res = await fetch(`/api/nba?companyId=${company.id}`);
                  setNbaItems((await res.json()).slice(0, 3));
                }}
                disabled={!company || (products.length === 0 && customers.length === 0)}
                className="text-xs bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50"
              >
                Generate Recommendations
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {nbaItems.map((item, i) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="bg-card border border-border rounded-lg shadow-sm p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                      <span className="text-xs text-muted-foreground">ICE: {item.iceScore.toFixed(1)}</span>
                    </div>
                    <h3 className="font-medium text-foreground">{item.title}</h3>
                    {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => handleFeedback(item.id, "ACCEPT")} className="p-2 rounded-md text-green-600 hover:bg-green-50">
                      <CheckCircle className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleFeedback(item.id, "DECLINE")} className="p-2 rounded-md text-red-600 hover:bg-red-50">
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Learning Insights */}
      {analytics && analytics.overview.totalItems > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <Lightbulb className="w-5 h-5 text-yellow-500" />
              Learning Insights
            </h2>
            <button 
              onClick={() => setShowAnalytics(!showAnalytics)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showAnalytics ? "Hide Details" : "View Analytics"}
            </button>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Acceptance Rate</div>
              <div className="text-xl font-bold text-foreground">{analytics.overview.overallAcceptanceRate}%</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">7-Day Trend</div>
              <div className="text-xl font-bold text-foreground flex items-center gap-1">
                {analytics.trends.sevenDayAcceptanceRate}%
                {parseFloat(analytics.trends.sevenDayAcceptanceRate) > parseFloat(analytics.trends.thirtyDayAcceptanceRate) ? (
                  <TrendingUp className="w-4 h-4 text-green-500" />
                ) : parseFloat(analytics.trends.sevenDayAcceptanceRate) < parseFloat(analytics.trends.thirtyDayAcceptanceRate) ? (
                  <TrendingDown className="w-4 h-4 text-red-500" />
                ) : (
                  <Minus className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Accepted</div>
              <div className="text-xl font-bold text-green-600">{analytics.overview.accepted}</div>
            </div>
            <div className="bg-card border border-border rounded-lg p-3">
              <div className="text-xs text-muted-foreground">Declined</div>
              <div className="text-xl font-bold text-red-600">{analytics.overview.declined}</div>
            </div>
          </div>

          {/* Insights */}
          {analytics.insights.length > 0 && (
            <div className="space-y-2 mb-4">
              {analytics.insights.map((insight, i) => (
                <motion.div 
                  key={i} 
                  initial={{ opacity: 0, x: -8 }} 
                  animate={{ opacity: 1, x: 0 }} 
                  transition={{ delay: i * 0.05 }}
                  className={`bg-card border rounded-lg p-3 flex items-start gap-3 ${
                    insight.type === "warning" ? "border-red-200 bg-red-50/50" :
                    insight.type === "recommendation" ? "border-green-200 bg-green-50/50" :
                    "border-blue-200 bg-blue-50/50"
                  }`}
                >
                  {insight.type === "warning" ? (
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  ) : insight.type === "recommendation" ? (
                    <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">{insight.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{insight.description}</div>
                  </div>
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">{insight.confidence}% confident</Badge>
                </motion.div>
              ))}
            </div>
          )}

          {/* Detailed Analytics (expandable) */}
          {showAnalytics && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: "auto" }}
              className="bg-card border border-border rounded-lg shadow-sm p-4 space-y-4"
            >
              {/* Recommendation Type Performance */}
              {analytics.recommendationTypeStats.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Recommendation Type Performance</h3>
                  <div className="space-y-2">
                    {analytics.recommendationTypeStats.map((stat, i) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-foreground flex-1 truncate">{stat.type}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">{stat.accepted}/{stat.total}</span>
                          <div className="w-20 bg-muted rounded-full h-1.5">
                            <div 
                              className={`h-1.5 rounded-full ${
                                stat.acceptanceRate >= 75 ? "bg-green-500" :
                                stat.acceptanceRate >= 50 ? "bg-yellow-500" :
                                "bg-red-500"
                              }`}
                              style={{ width: `${stat.acceptanceRate}%` }}
                            />
                          </div>
                          <span className="text-foreground font-medium w-12 text-right">{stat.acceptanceRate.toFixed(0)}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Decline Patterns */}
              {analytics.declinePatterns.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-foreground mb-2">Common Decline Reasons</h3>
                  <div className="space-y-2">
                    {analytics.declinePatterns.map((pattern, i) => (
                      <div key={i} className="text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-foreground font-medium">{pattern.pattern}</span>
                          <span className="text-muted-foreground">{pattern.count} items</span>
                        </div>
                        {pattern.examples.length > 0 && (
                          <div className="text-xs text-muted-foreground pl-3 border-l-2 border-muted">
                            {pattern.examples.slice(0, 2).map((ex, j) => (
                              <div key={j} className="italic">"{ex}"</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ICE Score Comparison */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-xs text-muted-foreground">Avg ICE (Accepted)</div>
                  <div className="text-lg font-bold text-green-600">{analytics.trends.avgAcceptedIceScore}</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <div className="text-xs text-muted-foreground">Avg ICE (Declined)</div>
                  <div className="text-lg font-bold text-red-600">{analytics.trends.avgDeclinedIceScore}</div>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      )}

      {/* Platform Modules */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Data Collection</h2>
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
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}