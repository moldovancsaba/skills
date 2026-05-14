'use client';

import { useParams } from "next/navigation";

import { ChecklistPage } from "@/components/checklist-page";

export default function CompanyArchivedChecklistPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  return <ChecklistPage companyId={companyId} archived />;
}
