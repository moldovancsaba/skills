'use client';

import { useState } from "react";
import { motion } from "framer-motion";
import { Brain, Target, TrendingUp, CheckCircle, AlertCircle, Clock, BarChart3, Users, DollarSign, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

const priorities = [
  { label: "Grow U10-U12 enrollment by 25%", progress: 72, status: "On track", owner: "Marketing" },
  { label: "Launch elite academy pathway program", progress: 38, status: "In progress", owner: "Programs" },
  { label: "Increase parent referral rate to 40%", progress: 85, status: "Ahead", owner: "Sales" },
  { label: "Expand facility capacity for fall", progress: 45, status: "In progress", owner: "Operations" },
  { label: "Hire 2 additional coaches", progress: 50, status: "On track", owner: "HR" },
];

const checkpoints = [
  { title: "Weekly Strategy Review", due: "Today", status: "due", items: 4 },
  { title: "Monthly Performance Analysis", due: "Apr 5", status: "upcoming", items: 12 },
  { title: "Quarterly Planning Q2", due: "Apr 15", status: "upcoming", items: 28 },
  { title: "Parent Feedback Survey", due: "Apr 20", status: "scheduled", items: 15 },
];

const metrics = [
  { label: "Revenue vs Goal", value: "$38.4K", target: "$45K", icon: DollarSign },
  { label: "Enrollment Rate", value: "87%", target: "90%", icon: Users },
  { label: "Retention Rate", value: "92%", target: "95%", icon: TrendingUp },
  { label: "NPS Score", value: "72", target: "75", icon: Award },
];

export default function StrategyPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Strategy</h1>
          <p className="text-sm text-muted-foreground mt-1">Strategic planning, priorities, and performance tracking.</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Brain className="w-4 h-4 mr-1" /> Run Checkpoint
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">{m.label}</span>
              <m.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-foreground">{m.value}</span>
              <span className="text-xs text-muted-foreground">/ {m.target}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card border border-border rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Strategic Priorities</h3>
            <Button size="sm" variant="outline">Add Priority</Button>
          </div>
          <div className="divide-y divide-border">
            {priorities.map((p, i) => (
              <motion.div key={p.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                  <Badge variant="outline" className={p.status === "Ahead" ? "bg-green-100 text-green-700" : p.status === "In progress" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"}>
                    {p.status}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={p.progress} className="flex-1 h-2" />
                  <span className="text-sm font-medium text-muted-foreground w-12">{p.progress}%</span>
                </div>
                <span className="text-xs text-muted-foreground">Owner: {p.owner}</span>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg shadow-sm">
          <div className="px-5 py-4 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">Upcoming Checkpoints</h3>
          </div>
          <div className="divide-y divide-border">
            {checkpoints.map((cp, i) => (
              <motion.div key={cp.title} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className="px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cp.status === "due" ? "bg-red-100" : "bg-blue-100"}`}>
                    <Clock className={`w-4 h-4 ${cp.status === "due" ? "text-red-600" : "text-blue-600"}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{cp.title}</p>
                    <p className="text-xs text-muted-foreground">{cp.items} items</p>
                  </div>
                </div>
                <Badge variant="outline" className={cp.status === "due" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"}>
                  {cp.due}
                </Badge>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}