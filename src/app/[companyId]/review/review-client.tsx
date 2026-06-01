'use client';

import { DestinationContentOpsWorkspace } from "@/components/destination-content-ops-workspace";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

type ReviewPageProps = {
  companyId: string;
  initialDestinationKey: DestinationKey;
};

export default function ReviewPage({ companyId, initialDestinationKey }: ReviewPageProps) {

  return <DestinationContentOpsWorkspace companyId={companyId} initialDestinationKey={initialDestinationKey} />;
}
