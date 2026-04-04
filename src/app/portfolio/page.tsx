'use client';

import { motion } from "framer-motion";
import { Package, DollarSign, Users, Calendar, TrendingUp, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const offerings = [
  { name: "Group Training (8-session)", type: "Recurring", price: "$450", revenue: "$18K/mo", enrollments: 42 },
  { name: "Private Training", type: "Premium", price: "$80/hr", revenue: "$12K/mo", enrollments: 15 },
  { name: "Summer Camp", type: "Seasonal", price: "$599/week", revenue: "$22K/season", enrollments: 38 },
  { name: "Birthday Parties", type: "Events", price: "$350/event", revenue: "$4K/mo", enrollments: 12 },
];

export default function PortfolioPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Portfolio & Offerings</h1>
          <p className="text-sm text-muted-foreground mt-1">Programs, pricing, and product management.</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Package className="w-4 h-4 mr-1" /> Add Offering
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Offerings", value: "12", icon: Package },
          { label: "Monthly Revenue", value: "$56K", icon: DollarSign, change: "+$8K" },
          { label: "Active Enrollments", value: "107", icon: Users, change: "+23" },
          { label: "Avg. Retention", value: "92%", icon: TrendingUp, change: "+5%" },
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
          <h3 className="text-sm font-semibold text-foreground">Offerings</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-5 py-3 text-left font-medium text-muted-foreground">Offering</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Price</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Revenue</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">Enrolled</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {offerings.map((o, i) => (
                <tr key={i} className="hover:bg-muted/20">
                  <td className="px-5 py-3 font-medium text-foreground">{o.name}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{o.type}</Badge></td>
                  <td className="px-4 py-3 text-center text-foreground">{o.price}</td>
                  <td className="px-4 py-3 text-center text-green-600 font-medium">{o.revenue}</td>
                  <td className="px-4 py-3 text-center text-foreground">{o.enrollments}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}