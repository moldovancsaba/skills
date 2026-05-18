"use strict";

function asArray(value) {
  return Array.isArray(value) ? value : undefined;
}

function withDefinedEntries(entries) {
  return Object.fromEntries(entries.filter(([, value]) => value !== undefined));
}

function buildTaskUpdatePayload(candidate) {
  const description = candidate?.description ?? candidate?.body ?? null;
  return withDefinedEntries([
    ["title", candidate?.title],
    ["description", description],
    ["userAnnotation", candidate?.userAnnotation ?? null],
    ["kind", candidate?.kind],
    ["impact", candidate?.impact],
    ["confidence", candidate?.confidence],
    ["confidenceScore", candidate?.confidenceScore],
    ["ease", candidate?.ease],
    ["iceScore", candidate?.iceScore],
    ["scoreProfile", candidate?.scoreProfile ?? undefined],
    ["hashtags", asArray(candidate?.hashtags)],
    ["processingStatus", candidate?.processingStatus],
    ["activityState", candidate?.activityState],
    ["status", candidate?.status],
    ["candidateState", candidate?.candidateState],
    ["reworkRoute", candidate?.reworkRoute ?? null],
    ["qualityScore", candidate?.qualityScore ?? null],
    ["urgencyScore", candidate?.urgencyScore ?? null],
    ["freshnessScore", candidate?.freshnessScore ?? null],
    ["feedbackScore", candidate?.feedbackScore ?? 0],
    ["evaluationReason", candidate?.evaluationReason ?? null],
    ["lastAuditedAt", candidate?.lastAuditedAt ?? null],
    ["lastRescoredAt", candidate?.lastRescoredAt ?? null],
    ["lastTaxonomyAuditedAt", candidate?.lastTaxonomyAuditedAt ?? null],
    ["hashtagMaintainedAt", candidate?.hashtagMaintainedAt ?? null],
    ["hashtagEvaluationPending", candidate?.hashtagEvaluationPending],
    ["lastHashtagError", candidate?.lastHashtagError ?? null],
    ["fingerprint", candidate?.fingerprint],
    ["sourceFlashcardIds", asArray(candidate?.sourceFlashcardIds)],
    ["generatedFromIds", asArray(candidate?.generatedFromIds)],
    ["versionFamilyId", candidate?.versionFamilyId ?? null],
    ["duplicateClusterId", candidate?.duplicateClusterId ?? null],
    ["refinedFromId", candidate?.refinedFromId ?? null],
    ["kanbanColumn", candidate?.kanbanColumn],
    ["sortOrder", candidate?.sortOrder],
  ]);
}

function buildFlashcardRefineUpdatePayload(candidate) {
  return withDefinedEntries([
    ["title", candidate?.title],
    ["body", candidate?.body ?? candidate?.description ?? undefined],
    ["confidence", candidate?.confidence],
    ["impact", candidate?.impact],
    ["weight", candidate?.weight],
    ["processingStatus", candidate?.processingStatus],
    ["activityState", candidate?.activityState],
    ["status", candidate?.status],
    ["reviewStatus", candidate?.reviewStatus],
    ["userAnnotation", candidate?.userAnnotation ?? null],
    ["hashtags", asArray(candidate?.hashtags)],
    ["evidence", candidate?.evidence ?? undefined],
    ["citationSnapshotIds", asArray(candidate?.citationSnapshotIds)],
    ["conflictDetected", candidate?.conflictDetected],
    ["conflictSummary", candidate?.conflictSummary ?? null],
    ["feedbackConfidenceDelta", candidate?.feedbackConfidenceDelta],
    ["feedbackWeightDelta", candidate?.feedbackWeightDelta],
    ["fingerprint", candidate?.fingerprint],
    ["kind", candidate?.kind],
    ["appVersion", candidate?.appVersion],
    ["brainVersion", candidate?.brainVersion],
    ["generatedAt", candidate?.generatedAt ?? null],
    ["promptVersion", candidate?.promptVersion],
    ["promptHash", candidate?.promptHash ?? null],
    ["promptName", candidate?.promptName],
    ["modelName", candidate?.modelName],
    ["modelVersion", candidate?.modelVersion ?? null],
    ["temperature", candidate?.temperature ?? null],
    ["createdByRunId", candidate?.createdByRunId ?? null],
    ["cycleRunId", candidate?.cycleRunId ?? null],
    ["intelligenceType", candidate?.intelligenceType],
    ["lastAuditedAt", candidate?.lastAuditedAt ?? null],
    ["lastRescoredAt", candidate?.lastRescoredAt ?? null],
    ["lastTaxonomyAuditedAt", candidate?.lastTaxonomyAuditedAt ?? null],
    ["lastCorrectionReconciledAt", candidate?.lastCorrectionReconciledAt ?? null],
    ["iceScore", candidate?.iceScore],
    ["scoreProfile", candidate?.scoreProfile ?? undefined],
    ["versionFamilyId", candidate?.versionFamilyId ?? null],
    ["duplicateClusterId", candidate?.duplicateClusterId ?? null],
    ["generatedFromIds", asArray(candidate?.generatedFromIds)],
    ["refinedFromId", candidate?.refinedFromId ?? null],
    ["refreshedAt", candidate?.refreshedAt ?? undefined],
    ["generatedTitle", candidate?.generatedTitle ?? null],
    ["generatedBody", candidate?.generatedBody ?? null],
    ["lastActionAt", candidate?.lastActionAt ?? null],
    ["manualBody", candidate?.manualBody ?? null],
    ["manualTitle", candidate?.manualTitle ?? null],
    ["hashtagMaintainedAt", candidate?.hashtagMaintainedAt ?? null],
    ["hashtagEvaluationPending", candidate?.hashtagEvaluationPending],
    ["lastHashtagError", candidate?.lastHashtagError ?? null],
  ]);
}

function buildFlashcardJudgeUpdatePayload(audit, reconciledAt, overrides = {}) {
  return withDefinedEntries([
    ["processingStatus", audit?.processingStatus],
    ["reviewStatus", audit?.reviewStatus],
    ["confidenceScore", audit?.confidenceScore],
    ["evidence", audit?.evidence ?? undefined],
    ["userAnnotation", audit?.userAnnotation ?? null],
    ["promptName", audit?.promptName ?? undefined],
    ["promptVersion", audit?.promptVersion ?? undefined],
    ["modelName", audit?.modelName ?? undefined],
    ["temperature", audit?.temperature ?? undefined],
    ["lastAuditedAt", overrides.lastAuditedAt ?? audit?.lastAuditedAt ?? reconciledAt],
    ["updatedAt", overrides.updatedAt ?? reconciledAt],
    ["lastCorrectionReconciledAt", overrides.lastCorrectionReconciledAt ?? reconciledAt],
    ["lastTaxonomyAuditedAt", overrides.lastTaxonomyAuditedAt],
    ["hashtagEvaluationPending", overrides.hashtagEvaluationPending],
    ["refreshedAt", overrides.refreshedAt],
  ]);
}

module.exports = {
  buildTaskUpdatePayload,
  buildFlashcardRefineUpdatePayload,
  buildFlashcardJudgeUpdatePayload,
};
