export type PipelineJobType =
  | "FEEDBACK_RECONCILIATION"
  | "CARD_RESCORING"
  | "FRONTIER_RECOMPUTE"
  | "ENSURE_FLASHCARD_MINIMUM"
  | "RESEARCH_BACKFILL"
  | "ENSURE_IDEABANK_MINIMUM"
  | "ENSURE_ROADMAP_MINIMUM"
  | "ENSURE_BACKLOG_MINIMUM"
  | "ENSURE_TODO_MINIMUM"
  | "ENSURE_CHECKLIST_MINIMUM"
  | "MINE_FLASHCARD_OPPORTUNITIES"
  | "MINE_TASK_OPPORTUNITIES"
  | "MINE_OPPORTUNITYCARDS"
  | "FEEDBACK_PRESSURE_REGENERATION"
  | "REFRESH_FLASHCARDS"
  | "REFRESH_TASKS"
  | "REFRESH_OPPORTUNITYCARDS"
  | "REFRESH_DATACARDS"
  | "REFRESH_GOALS"
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
export const CORE_PIPELINE_JOB_TYPES: readonly PipelineJobType[];
export const PLANNER_BOOTSTRAP_JOB_TYPES: readonly PipelineJobType[];
export const PLANNER_QUALITY_JOB_TYPES: readonly PipelineJobType[];
export const PLANNER_MAINTENANCE_JOB_TYPES: readonly PipelineJobType[];
export const LEGACY_COMPAT_PIPELINE_JOB_TYPES: readonly PipelineJobType[];
export const PIPELINE_QUEUE_COLUMNS: readonly PipelineQueueColumn[];
export const PIPELINE_CONTROL_MODES: readonly PipelineControlMode[];
export const PIPELINE_JOB_STATUSES: readonly PipelineJobStatus[];
export const PIPELINE_JOB_NO_PROGRESS_TIMEOUT_MS: number;
export const GLOBAL_PIPELINE_SYNC_INTERVAL_MS: number;
export const PIPELINE_JOB_RETRY_LIMITS: Readonly<Record<string, number>>;
export const PIPELINE_FAILURE_CLASSES: Readonly<Record<string, string>>;

export function getPipelineJobLabel(jobType: PipelineJobType): string;
export function getQueueColumnRank(column: PipelineQueueColumn): number;
export function buildNoProgressTimeoutMessage(timeoutMs?: number): string;
export function getPipelineJobRetryLimit(jobType: PipelineJobType | string): number;
export function classifyPipelineJobError(error: unknown): {
  class: string;
  retryable: boolean;
  retryAfterMs: number | null;
  message: string;
};
export function shouldRunGlobalPipelineSync(lastSyncAt: number, now?: number, intervalMs?: number): boolean;
export function gatherCompanyPipelineSignals(prisma: unknown, companyId: string): Promise<unknown>;
export function syncCompanyPipelineJobs(prisma: unknown, companyId: string): Promise<PipelineJobRecord[]>;
export function syncAllCompanyPipelineJobs(prisma: unknown): Promise<void>;
export function syncPipelineJobsForCompanyShard(prisma: unknown, limit?: number): Promise<number>;
export function syncAllCompanyPipelineJobsIfDue(
  prisma: unknown,
  options?: { now?: number; force?: boolean },
): Promise<boolean>;
export function markCompanyPipelineTopologyDirty(prisma: unknown, companyId: string, reason?: string): Promise<unknown>;
export function recoverStaleRunningPipelineJobs(prisma: unknown): Promise<unknown>;
export function recoverOrphanedRunningPipelineJobs(prisma: unknown): Promise<unknown>;
export function listCompanyPipelineJobs(prisma: unknown, companyId: string): Promise<PipelineJobRecord[]>;
export function listPersistedCompanyPipelineJobs(prisma: unknown, companyId: string): Promise<PipelineJobRecord[]>;
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
export function failPipelineJob(prisma: unknown, job: PipelineJobRecord, error: unknown): Promise<PipelineJobRecord>;
