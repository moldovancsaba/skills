export type PipelineJobType =
  | "FEEDBACK_RECONCILIATION"
  | "CARD_RESCORING"
  | "FRONTIER_RECOMPUTE"
  | "FULL_MAINTENANCE"
  | "SCORE_ALERT_REPAIR"
  | "COMPANY_SYNTHESIS"
  | "WORKFLOW_BLUEPRINT";

export type PipelineQueueColumn = "NOW" | "SOON" | "LATER" | "PARKED";
export type PipelineControlMode = "AI_ONLY" | "HUMAN_GUIDED";
export type PipelineJobStatus = "ACTIVE" | "RUNNING" | "PAUSED" | "FAILED";

export type PipelineJobRecord = {
  id: string;
  companyId: string;
  jobType: PipelineJobType;
  entityType: string;
  entityId?: string | null;
  status: PipelineJobStatus;
  controlMode: PipelineControlMode;
  queueColumn: PipelineQueueColumn;
  manualSortOrder: number;
  priorityScore: number;
  reason?: string | null;
  sourceSignal?: string | null;
  lastError?: string | null;
  scheduledAt?: string | Date | null;
  lastTriedAt?: string | Date | null;
  lastCompletedAt?: string | Date | null;
  attemptCount: number;
  createdAt: string | Date;
  updatedAt: string | Date;
  company?: {
    id: string;
    name: string;
  };
};

export const PIPELINE_JOB_TYPES: readonly PipelineJobType[];
export const PIPELINE_QUEUE_COLUMNS: readonly PipelineQueueColumn[];
export const PIPELINE_CONTROL_MODES: readonly PipelineControlMode[];
export const PIPELINE_JOB_STATUSES: readonly PipelineJobStatus[];

export function getPipelineJobLabel(jobType: PipelineJobType): string;
export function getQueueColumnRank(column: PipelineQueueColumn): number;
export function gatherCompanyPipelineSignals(prisma: unknown, companyId: string): Promise<unknown>;
export function syncCompanyPipelineJobs(prisma: unknown, companyId: string): Promise<PipelineJobRecord[]>;
export function syncAllCompanyPipelineJobs(prisma: unknown): Promise<void>;
export function listCompanyPipelineJobs(prisma: unknown, companyId: string): Promise<PipelineJobRecord[]>;
export function resetCompanyPipelineJobsToAiOnly(prisma: unknown, companyId: string): Promise<PipelineJobRecord[]>;
export function applyManualPipelineQueueMove(
  prisma: unknown,
  companyId: string,
  movedJobId: string,
  sourceColumn: PipelineQueueColumn,
  destinationColumn: PipelineQueueColumn,
  destinationColumnOrderIds: string[],
  sourceColumnOrderIds?: string[],
): Promise<{ moved: PipelineJobRecord | null; jobs: PipelineJobRecord[] }>;
export function claimNextPipelineJobs(prisma: unknown, limit?: number): Promise<PipelineJobRecord[]>;
export function completePipelineJob(prisma: unknown, jobId: string, reason?: string | null): Promise<PipelineJobRecord>;
export function escalateCompanyPipelineJob(
  prisma: unknown,
  companyId: string,
  jobType: PipelineJobType,
  entityType?: string,
  entityId?: string,
): Promise<PipelineJobRecord | null>;
export function recoverFailedCompanyPipelineJobs(prisma: unknown, companyId: string): Promise<PipelineJobRecord[]>;
export function failPipelineJob(prisma: unknown, jobId: string, error: unknown): Promise<PipelineJobRecord>;
