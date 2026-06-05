export type MaintenanceStepResult = {
  id: string;
  status: "created" | "skipped" | "updated" | "repaired";
  summary: string;
  metadata?: Record<string, unknown>;
};

export function maintainCompanyLifecycle(prisma: unknown, input: string | {
  companyId: string;
  actorId?: string;
}): Promise<{
  ok: boolean;
  companyId?: string;
  company?: { id: string; name: string };
  state: string;
  destinationKeys?: string[];
  requiredPipelineJobs?: string[];
  requiredMissionKinds?: string[];
  jobCount?: number;
  daemonJobs?: unknown[];
  daemonLane?: unknown;
  lifecycleHealth?: unknown;
  telemetry?: unknown;
  steps: MaintenanceStepResult[];
}>;

export function maintainLifecycleShard(prisma: unknown, options?: {
  limit?: number;
  actorId?: string;
}): Promise<{
  ok: boolean;
  inspected: number;
  repairedOrVerified: number;
  results: unknown[];
}>;
