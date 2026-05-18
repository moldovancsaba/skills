import { NextRequest, NextResponse } from "next/server";

type ProfileStep = {
  name: string;
  durationMs: number;
};

function roundMs(value: number) {
  return Math.round(value * 10) / 10;
}

export function shouldExposeRequestProfile(request: NextRequest) {
  return request.nextUrl.searchParams.get("profile") === "1"
    || request.headers.get("x-checklist-profile") === "1";
}

export function createRequestProfiler(request: NextRequest, label = "request") {
  const startedAt = performance.now();
  const steps: ProfileStep[] = [];
  const enabled = shouldExposeRequestProfile(request);

  async function measure<T>(name: string, work: () => Promise<T> | T): Promise<T> {
    const stepStartedAt = performance.now();
    const result = await work();
    steps.push({
      name,
      durationMs: roundMs(performance.now() - stepStartedAt),
    });
    return result;
  }

  function getSummary() {
    return {
      label,
      totalMs: roundMs(performance.now() - startedAt),
      steps,
    };
  }

  function apply(response: NextResponse) {
    const summary = getSummary();
    const serverTiming = [
      `total;dur=${summary.totalMs}`,
      ...summary.steps.map((step) => `${step.name};dur=${step.durationMs}`),
    ].join(", ");
    response.headers.set("Server-Timing", serverTiming);
    if (enabled) {
      response.headers.set("X-Checklist-Profile-Label", label);
    }
    return response;
  }

  return {
    enabled,
    measure,
    getSummary,
    apply,
  };
}
