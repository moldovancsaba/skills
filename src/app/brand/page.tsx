'use client';

import { motion } from "framer-motion";
import { Paintbrush, FileText, Image, Palette, MessageSquare, Globe } from "lucide-react";
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
        <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Paintbrush className="w-4 h-4 mr-1" /> Edit Brand
        </Button>
      </motion.div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Brand Status</span>
            <Badge variant="outline" className="bg-yellow-100 text-yellow-700">Draft</Badge>
          </div>
          <p className="text-lg font-bold text-foreground">Brand Book</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Messaging</span>
            <Badge variant="outline" className="bg-green-100 text-green-700">Complete</Badge>
          </div>
          <p className="text-lg font-bold text-foreground">Core Messages</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Visual Assets</span>
            <Badge variant="outline" className="bg-blue-100 text-blue-700">In Progress</Badge>
          </div>
          <p className="text-lg font-bold text-foreground">Template Library</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg shadow-sm p-6">
        <h3 className="text-sm font-semibold text-foreground mb-4">Brand Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Colors</h4>
            <div className="flex gap-2">
              <div className="w-12 h-12 rounded-lg bg-blue-600" />
              <div className="w-12 h-12 rounded-lg bg-green-600" />
              <div className="w-12 h-12 rounded-lg bg-gray-900" />
            </div>
          </div>
          <div className="space-y-3">
            <h4 className="text-xs font-medium text-muted-foreground uppercase">Typography</h4>
            <div>
              <p className="text-lg font-semibold">Inter, system-ui</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}