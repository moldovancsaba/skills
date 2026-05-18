import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { recordAiWorkloadUsage } from "@/lib/budget-governor";
import { getLocalLearningRegistry, getLocalLearningRun, listLocalLearningRuns } from "@/lib/local-learning";
import {
  EVALUATION_SUITES,
  SEEDED_EVALUATION_CASES,
  compareEvaluationVariants,
  type EvaluationCaseResult,
  type EvaluationVariant,
} from "@/lib/evaluation-bench";
import { verifyMembership } from "@/lib/permissions";

export const dynamic = "force-dynamic";

function failedCaseSummary(failedCases: EvaluationCaseResult[]) {
  return failedCases
    .slice(0, 4)
    .map((item) => `${item.caseId}: ${Math.round(item.score * 100)}% ${item.gateOutcome}`)
    .join("; ");
}

export async function GET(request: NextRequest) {
  const companyId = request.nextUrl.searchParams.get("companyId");
  if (!companyId) {
    return NextResponse.json({ error: "companyId required" }, { status: 400 });
  }

  const auth = await verifyMembership(request, companyId, "ADMIN");
  if (auth.error) return auth.error;

  const comparison = compareEvaluationVariants();
  const learningRuns = await listLocalLearningRuns();
  return NextResponse.json({
    suites: EVALUATION_SUITES,
    cases: SEEDED_EVALUATION_CASES,
    comparison,
    learningRuns,
    registry: await getLocalLearningRegistry(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = String(data.companyId || "");
    const action = String(data.action || "");
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId, "ADMIN");
    if (auth.error) return auth.error;

    if (action === "PUBLISH_LOCAL_LEARNING_RUN") {
      const runId = String(data.runId || "");
      if (!runId) {
        return NextResponse.json({ error: "runId required" }, { status: 400 });
      }

      const run = await getLocalLearningRun(runId);
      if (!run) {
        return NextResponse.json({ error: "Local learning run not found" }, { status: 404 });
      }
      if (run.companyId !== companyId) {
        return NextResponse.json({ error: "Run does not belong to this company" }, { status: 403 });
      }
      if (!run.report) {
        return NextResponse.json({ error: "Run has no evaluation report yet" }, { status: 400 });
      }

      await recordAiWorkloadUsage({
        companyId,
        feature: "local-self-learning",
        jobType: "PUBLISH_LOCAL_LEARNING_RUN",
        entityType: "LOCAL_LEARNING_RUN",
        entityId: run.runId,
        workloadUnits: run.report.totalCases,
        runtimeMs: 0,
        valueSignal: run.gateStatus === "PASS" ? "REGRESSION_CHECK" : "SAFETY_GATE",
        metadata: {
          candidateName: run.candidateName,
          gateStatus: run.gateStatus,
          candidateScore: run.report.candidateScore,
          baselineScore: run.report.baselineScore,
          delta: run.report.delta,
        },
      });

      await recordOutcomeEvent({
        companyId,
        actorType: "HUMAN",
        actorEmail: auth.session.email,
        entityType: "LOCAL_LEARNING_RUN",
        entityId: run.runId,
        outcomeType: run.gateStatus === "PASS" ? "LOCAL_LEARNING_PROMOTION_CANDIDATE" : "LOCAL_LEARNING_GATE_REVIEW_REQUIRED",
        outcomeValue: run.gateStatus,
        annotation: `${run.candidateName}: ${run.gateReason}`,
        payload: {
          candidateName: run.candidateName,
          baseModel: run.baseModel,
          baselineModel: run.report.baselineModel,
          candidateModel: run.report.candidateModel,
          baselineScore: run.report.baselineScore,
          candidateScore: run.report.candidateScore,
          baselinePassRate: run.report.baselinePassRate,
          candidatePassRate: run.report.candidatePassRate,
          delta: run.report.delta,
          totalCases: run.report.totalCases,
          exportLabel: run.exportLabel,
        },
        teachingWeight: 90,
      });

      return NextResponse.json({
        published: true,
        runId: run.runId,
        gateStatus: run.gateStatus,
        learningRuns: await listLocalLearningRuns(),
        registry: await getLocalLearningRegistry(),
      });
    }

    const candidate = (data.candidate || {}) as EvaluationVariant;
    const persistObservability = Boolean(data.persistObservability);
    const startedAt = Date.now();
    const comparison = compareEvaluationVariants(candidate);
    await recordAiWorkloadUsage({
      companyId,
      feature: "evaluation-bench",
      jobType: "EVALUATION_REPLAY",
      entityType: "EVALUATION_SUITE",
      entityId: comparison.candidate.suiteId,
      workloadUnits: comparison.candidate.cases.length,
      runtimeMs: Date.now() - startedAt,
      valueSignal: comparison.candidate.failedCases.length > 0 ? "SAFETY_GATE" : "REGRESSION_CHECK",
      metadata: {
        aggregateScore: comparison.candidate.aggregateScore,
        passRate: comparison.candidate.passRate,
        failedCases: comparison.candidate.failedCases.length,
      },
    });

    if (persistObservability && comparison.candidate.failedCases.length > 0) {
      await recordOutcomeEvent({
        companyId,
        actorType: "SYSTEM",
        entityType: "EVALUATION_SUITE",
        entityId: comparison.candidate.suiteId,
        outcomeType: "EVAL_GATE_FAILED",
        outcomeValue: comparison.promotionGate.status,
        annotation: failedCaseSummary(comparison.candidate.failedCases),
        payload: {
          runId: comparison.candidate.runId,
          aggregateScore: comparison.candidate.aggregateScore,
          passRate: comparison.candidate.passRate,
          failedCases: comparison.candidate.failedCases.map((item) => ({
            caseId: item.caseId,
            score: item.score,
            gateOutcome: item.gateOutcome,
            reasons: item.reasons,
          })),
        },
        teachingWeight: 90,
      });
    }

    return NextResponse.json({
      comparison,
      observabilityPublished: persistObservability && comparison.candidate.failedCases.length > 0,
      learningRuns: await listLocalLearningRuns(),
      registry: await getLocalLearningRegistry(),
    });
  } catch (error) {
    console.error("[API:Evaluations] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
