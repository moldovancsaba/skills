'use client';

import { useParams } from "next/navigation";

import { checklistPage } from "@/components/checklist-page";

export default function CompanyArchivedNBAPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  return <checklistPage companyId={companyId} archived />;
}
