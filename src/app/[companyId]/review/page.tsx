'use client';

import { useParams } from "next/navigation";
import { DestinationContentOpsWorkspace } from "@/components/destination-content-ops-workspace";

export default function ReviewPage() {
  const params = useParams();
  const companyId = params.companyId as string;

  return <DestinationContentOpsWorkspace companyId={companyId} />;
}
