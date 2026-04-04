'use client';

import { motion } from "framer-motion";
import { Search, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function IntelligencePage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Intelligence</h1>
          <p className="text-sm text-muted-foreground mt-1">AI agents monitoring competitors and market signals.</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: "Competitors Tracked", value: "--" },
          { label: "Market Signals (7d)", value: "--" },
          { label: "Critical Alerts", value: "--" },
          { label: "Customer Segments", value: "--" },
          { label: "Market Growth", value: "--" },
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
          Set up database to enable competitor monitoring and market intelligence.
        </p>
      </div>
    </div>
  );
}