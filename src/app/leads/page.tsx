'use client';

import { useState } from "react";
import { motion } from "framer-motion";
import { Target, Users, TrendingUp, DollarSign, Mail, Phone, MessageSquare, ExternalLink, Plus, Filter, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const campaigns = [
  { name: "Instagram U12 Competitive", status: "Active", leads: 12, cost: "$450", conversions: 3, roi: "+220%" },
  { name: "Facebook Parents 30-45", status: "Active", leads: 8, cost: "$320", conversions: 2, roi: "+180%" },
  { name: "Google Search Indoor Soccer", status: "Paused", leads: 24, cost: "$890", conversions: 6, roi: "+145%" },
  { name: "Email Winter Clinic", status: "Completed", leads: 45, cost: "$180", conversions: 12, roi: "+340%" },
];

const recentLeads = [
  { name: "John D.", source: "Instagram", status: "New", interest: "Elite Academy", age: "U12", time: "2h ago" },
  { name: "Sarah M.", source: "Google", status: "Contacted", interest: "Group Training", age: "U10", time: "4h ago" },
  { name: "Mike R.", source: "Referral", status: "Qualified", interest: "Private Training", age: "U14", time: "1d ago" },
  { name: "Lisa K.", source: "Facebook", status: "New", interest: "Summer Camp", age: "U8", time: "1d ago" },
  { name: "David P.", source: "Email", status: "Appointment", interest: "Elite Academy", age: "U12", time: "2d ago" },
];

export default function LeadsPage() {
  const [activeTab, setActiveTab] = useState("campaigns");

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Lead Generation</h1>
          <p className="text-sm text-muted-foreground mt-1">Campaigns, tracking, and conversion optimization.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline">
            <Filter className="w-4 h-4 mr-1" /> Filter
          </Button>
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-1" /> New Campaign
          </Button>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Leads", value: "89", icon: Users, change: "+23 this month" },
          { label: "New This Week", value: "12", icon: Target, change: "+4 vs last week" },
          { label: "Conversion Rate", value: "24%", icon: TrendingUp, change: "+3% vs last month" },
          { label: "Cost per Lead", value: "$18", icon: DollarSign, change: "-$4 vs last month" },
        ].map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">{m.label}</span>
              <m.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-foreground">{m.value}</span>
              <span className="text-xs text-green-600">{m.change}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Campaigns</h3>
          <Button size="sm" variant="outline"><RefreshCw className="w-4 h-4" /></Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Campaign</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Leads</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Cost</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Converted</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">ROI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {campaigns.map((c, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium text-foreground">{c.name}</td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant="outline" className={c.status === "Active" ? "bg-green-100 text-green-700" : c.status === "Paused" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"}>
                      {c.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center text-foreground">{c.leads}</td>
                  <td className="px-4 py-3 text-center text-foreground">{c.cost}</td>
                  <td className="px-4 py-3 text-center text-foreground">{c.conversions}</td>
                  <td className="px-4 py-3 text-center text-green-600 font-medium">{c.roi}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Recent Leads</h3>
        </div>
        <div className="divide-y divide-border">
          {recentLeads.map((lead, i) => (
            <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
              className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{lead.name}</p>
                  <p className="text-xs text-muted-foreground">{lead.interest} - {lead.age}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="text-xs">{lead.source}</Badge>
                <Badge variant="outline" className={lead.status === "New" ? "bg-blue-100 text-blue-700" : lead.status === "Qualified" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                  {lead.status}
                </Badge>
                <span className="text-xs text-muted-foreground">{lead.time}</span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}