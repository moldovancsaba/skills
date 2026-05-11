import { NextRequest, NextResponse } from "next/server";
import { recordOutcomeEvent } from "@/lib/audit-ledger";
import { recordAiWorkloadUsage } from "@/lib/budget-governor";
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

  const auth = await verifyMembership(request, companyId);
  if (auth.error) return auth.error;

  const comparison = compareEvaluationVariants();
  return NextResponse.json({
    suites: EVALUATION_SUITES,
    cases: SEEDED_EVALUATION_CASES,
    comparison,
  });
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const companyId = String(data.companyId || "");
    if (!companyId) {
      return NextResponse.json({ error: "companyId required" }, { status: 400 });
    }

    const auth = await verifyMembership(request, companyId);
    if (auth.error) return auth.error;

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
    });
  } catch (error) {
    console.error("[API:Evaluations] failure:", error);
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
