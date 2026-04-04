'use client';

import { motion } from "framer-motion";
import { Paintbrush, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function BrandPage() {
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Brand Management</h1>
          <p className="text-sm text-muted-foreground mt-1">Brand identity, messaging, and visual guidelines.</p>
        </div>
        <Button size="sm" disabled>
          <span className="text-muted-foreground">Coming soon</span>
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Brand Status", value: "--", status: "Coming soon" },
          { label: "Messaging", value: "--", status: "Coming soon" },
          { label: "Visual Assets", value: "--", status: "Coming soon" },
        ].map((m, i) => (
          <div key={i} className="bg-card border border-border rounded-lg p-4 shadow-sm">
            <span className="text-xs font-medium text-muted-foreground uppercase">{m.label}</span>
            <span className="text-lg font-bold text-foreground block">{m.value}</span>
            <Badge variant="outline" className="mt-2">{m.status}</Badge>
          </div>
        ))}
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-center gap-3 text-muted-foreground">
          <Info className="w-5 h-5" />
          <span className="text-lg">Coming soon</span>
        </div>
        <p className="text-sm text-muted-foreground text-center mt-2">
          Set up database to enable brand management features.
        </p>
      </div>
    </div>
  );
}