/**
 * TACTICAL BOARD PAGE
 * v1.0.0
 * 
 * Implements the multi-horizon Kanban orchestration.
 */
'use client';

import { useParams } from "next/navigation";
import { TacticalBoard } from "@/components/tactical-board";

export default function TacticalPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  return <TacticalBoard companyId={companyId} />;
}
