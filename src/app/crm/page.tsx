'use client';

import { useState } from "react";
import { motion } from "framer-motion";
import { Users, TrendingUp, UserPlus, Calendar, Mail, Phone, MessageSquare, Star, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const pipeline = [
  { stage: "New Leads", count: 24, value: "$12K" },
  { stage: "Contacted", count: 18, value: "$24K" },
  { stage: "Qualified", count: 12, value: "$36K" },
  { stage: "Proposal", count: 6, value: "$28K" },
  { stage: "Closed Won", count: 8, value: "$45K" },
];

const recentContacts = [
  { name: "Michael Thompson", status: "Active", program: "Elite Academy", lastContact: "1d ago", nextAction: "Follow-up call", priority: "high" },
  { name: "Jennifer Lee", status: "Active", program: "Group Training", lastContact: "2d ago", nextAction: "Send schedule", priority: "medium" },
  { name: "Robert Garcia", status: "Inactive", program: "Summer Camp", lastContact: "1w ago", nextAction: "Re-engage", priority: "low" },
  { name: "Amanda Wilson", status: "Active", program: "Private Training", lastContact: "3d ago", nextAction: "Trial session", priority: "high" },
];

export default function CrmPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">CRM & Automation</h1>
          <p className="text-sm text-muted-foreground mt-1">Lead pipeline management and customer tracking.</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <UserPlus className="w-4 h-4 mr-1" /> Add Contact
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Leads", value: "46", icon: Users, change: "+12 this month" },
          { label: "This Month", value: "8", icon: CheckCircle, change: "+3 vs last month" },
          { label: "Pipeline Value", value: "$145K", icon: TrendingUp, change: "+$24K vs last month" },
          { label: "Avg. Response", value: "2.4h", icon: Clock, change: "-0.5h vs last month" },
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
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Pipeline Overview</h3>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-2">
            {pipeline.map((stage, i) => (
              <div key={stage.stage} className="flex-1">
                <div className="text-center mb-2">
                  <p className="text-xs text-muted-foreground">{stage.stage}</p>
                  <p className="text-lg font-bold text-foreground">{stage.count}</p>
                  <p className="text-xs text-muted-foreground">{stage.value}</p>
                </div>
                {i < pipeline.length - 1 && (
                  <div className="h-8 border-l border-dashed border-border mx-auto" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Recent Contacts</h3>
        </div>
        <div className="divide-y divide-border">
          {recentContacts.map((contact, i) => (
            <motion.div key={contact.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
              className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center">
                  <Users className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">{contact.program}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Last: {contact.lastContact}</span>
                <Badge variant="outline" className="text-xs">{contact.nextAction}</Badge>
                <Badge variant="outline" className={contact.priority === "high" ? "bg-red-100 text-red-700" : contact.priority === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-gray-100 text-gray-700"}>
                  {contact.priority}
                </Badge>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}