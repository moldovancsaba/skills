'use client';

import { motion } from "framer-motion";
import { Beaker, FlaskConical, TrendingUp, CheckCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function PreFortitudePage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Pre-Fortitude AI</h1>
          <p className="text-sm text-muted-foreground mt-1">New program validation and market testing.</p>
        </div>
        <Button size="sm" disabled>
          <span className="text-muted-foreground">Coming soon</span>
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Active Experiments", value: "--" },
          { label: "Total Participants", value: "--" },
          { label: "Avg. Conversion", value: "--" },
          { label: "Successful Tests", value: "--" },
        ].map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <span className="text-xs font-medium text-muted-foreground uppercase">{m.label}</span>
            <span className="text-xl font-bold text-foreground block">{m.value}</span>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Info className="w-5 h-5" />
          <span className="text-lg">Coming soon</span>
        </div>
        <p className="text-sm text-muted-foreground text-center mt-2">
          Set up database to enable program validation experiments.
        </p>
      </div>
    </div>
  );
}