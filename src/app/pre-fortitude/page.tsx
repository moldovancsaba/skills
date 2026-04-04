'use client';

import { motion } from "framer-motion";
import { Beaker, FlaskConical, TrendingUp, Clock, Zap, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const experiments = [
  { name: "Weekend Intensive Program", status: "Running", participants: 18, conversion: "24%", daysLeft: 5 },
  { name: "Virtual Tryout Sessions", status: "Testing", participants: 12, conversion: "0%", daysLeft: 12 },
  { name: "Sibling Discount Offer", status: "Analyzing", participants: 8, conversion: "38%", daysLeft: 0 },
];

export default function PreFortitudePage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pre-Fortitude AI</h1>
          <p className="text-sm text-muted-foreground mt-1">New program validation and market testing.</p>
        </div>
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Beaker className="w-4 h-4 mr-1" /> New Experiment
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Experiments", value: "2", icon: Beaker },
          { label: "Total Participants", value: "38", icon: FlaskConical },
          { label: "Avg. Conversion", value: "21%", icon: TrendingUp },
          { label: "Successful Tests", value: "1", icon: CheckCircle },
        ].map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase">{m.label}</span>
              <m.icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">{m.value}</span>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Running Experiments</h3>
        </div>
        <div className="divide-y divide-border">
          {experiments.map((exp, i) => (
            <motion.div key={exp.name} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
              className="px-5 py-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${exp.status === "Running" ? "bg-blue-100" : exp.status === "Testing" ? "bg-yellow-100" : "bg-green-100"}`}>
                  <Beaker className={`w-4 h-4 ${exp.status === "Running" ? "text-blue-600" : exp.status === "Testing" ? "text-yellow-600" : "text-green-600"}`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">{exp.name}</p>
                  <p className="text-xs text-muted-foreground">{exp.participants} participants</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-foreground">{exp.conversion}</span>
                <Badge variant="outline" className={exp.status === "Running" ? "bg-blue-100 text-blue-700" : exp.status === "Testing" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}>
                  {exp.status}
                </Badge>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}