'use client';

import { DestinationContentOpsWorkspace } from "@/components/destination-content-ops-workspace";

type ReviewPageProps = {
  companyId: string;
};

export default function ReviewPage({ companyId }: ReviewPageProps) {

  return <DestinationContentOpsWorkspace companyId={companyId} />;
}
