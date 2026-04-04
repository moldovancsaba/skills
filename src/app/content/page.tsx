'use client';

import { motion } from "framer-motion";
import { PenTool, Globe, TrendingUp, Eye, Heart, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const content = [
  { title: "1000+ Touches Training Reel", platform: "Instagram", views: "2.4K", engagement: "8.2%", status: "Published" },
  { title: "Summer Camp Promo Video", platform: "YouTube", views: "890", engagement: "6.1%", status: "Published" },
  { title: "Parent Guide Email", platform: "Email", views: "45%", engagement: "12%", status: "Sent" },
  { title: "New Drill Tutorial", platform: "Instagram", views: "0", engagement: "0%", status: "Draft" },
];

export default function ContentPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Digital Presence</h1>
          <p className="text-sm text-muted-foreground mt-1">Website, social profiles, and content assets.</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <PenTool className="w-4 h-4 mr-1" /> Create Content
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Views", value: "12.4K", icon: Eye },
          { label: "Engagement Rate", value: "7.2%", icon: Heart },
          { label: "Followers", value: "3.2K", icon: Globe, change: "+240" },
          { label: "Shares", value: "342", icon: Share2, change: "+45" },
        ].map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">{m.label}</span>
              <m.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-foreground">{m.value}</span>
              {m.change && <span className="text-xs text-green-600">{m.change}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Recent Content</h3>
        </div>
        <div className="divide-y divide-border">
          {content.map((c, i) => (
            <motion.div key={c.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
              className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PenTool className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium text-foreground">{c.title}</p>
                  <p className="text-xs text-muted-foreground">{c.platform}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xs text-muted-foreground">{c.views} views</span>
                <Badge variant="outline" className={c.status === "Published" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                  {c.status}
                </Badge>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}