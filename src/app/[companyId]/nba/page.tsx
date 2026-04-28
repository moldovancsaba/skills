/**
 * NBA checklist PAGE
 * v0.11.3-PRODUCTION
 * 
 * Implements Unified Page Architecture:
 * - PageShell: Full-Width Layout
 * - UnifiedGrid: 3-Column Desktop Display
 */
'use client';

import { useParams } from "next/navigation";

import { checklistPage } from "@/components/checklist-page";

export default function CompanyNBAPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  return <checklistPage companyId={companyId} />;
}
