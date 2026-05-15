const SCORE_MIN = 1;
const SCORE_MAX = 10;
const KNOWLEDGE_ICE_DIVISOR = 10;
const HIGH_URGENCY_KEYWORDS = [
  "urgent",
  "immediately",
  "today",
  "this week",
  "deadline",
  "launch",
  "incident",
  "blocker",
  "renewal",
  "customer",
  "competitor",
  "pricing",
  "churn",
  "pipeline",
  "revenue",
];
const COMPLEXITY_KEYWORDS = [
  "audit",
  "analyze",
  "compare",
  "document",
  "coordinate",
  "migrate",
  "review",
  "research",
  "interview",
  "validate",
  "prototype",
  "experiment",
];
const DEPENDENCY_KEYWORDS = [
  "approve",
  "approval",
  "stakeholder",
  "vendor",
  "integration",
  "dependency",
  "dependencies",
  "cross-functional",
  "handoff",
  "legal",
  "finance",
  "ops",
];
const COORDINATION_KEYWORDS = [
  "team",
  "teams",
  "meeting",
  "align",
  "alignment",
  "coordinate",
  "workshop",
  "review",
  "committee",
  "partner",
  "customer",
  "leadership",
];
const EXPERTISE_KEYWORDS = [
  "strategy",
  "technical",
  "engineering",
  "analytics",
  "research",
  "pricing",
  "forecast",
  "architecture",
  "compliance",
  "security",
  "diagnostic",
  "benchmark",
];
const TIME_TO_VALUE_KEYWORDS = [
  "quarter",
  "quarters",
  "month",
  "months",
  "roadmap",
  "program",
  "rollout",
  "pilot",
  "migration",
  "transformation",
  "launch",
];
const PRIORITY_SCORE_MAX = 1000;
const PRIORITY_WEIGHTS = Object.freeze({
  ice: 0.22,
  quality: 0.20,
  urgency: 0.18,
  freshness: 0.14,
  human: 0.16,
  risk: 0.10,
});
const PRIORITY_STATE_MULTIPLIERS = Object.freeze({
  EVALUATED: 1,
  REFINED: 0.86,
  GENERATED: 0.72,
});
const PRIORITY_DENSITY_BUCKET_SIZE = 15;
const QUALITY_DIMENSION_KEYS = Object.freeze([
  "evidenceQuality",
  "linguisticQuality",
  "actionabilityQuality",
  "strategicValue",
]);

function clampMetric(value, min = SCORE_MIN, max = SCORE_MAX) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return min;
  }

  const canonical =
    numeric > SCORE_MAX
      ? numeric <= 100
        ? numeric / 10
        : SCORE_MAX
      : numeric;

  const bounded = Math.max(min, Math.min(max, canonical));
  return Number(bounded.toFixed(1));
}

function clampMetricPrecise(value, min = SCORE_MIN, max = SCORE_MAX, precision = 2) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Number(min.toFixed(precision));
  }

  const canonical =
    numeric > SCORE_MAX
      ? numeric <= 100
        ? numeric / 10
        : SCORE_MAX
      : numeric;

  const bounded = Math.max(min, Math.min(max, canonical));
  return Number(bounded.toFixed(precision));
}

function roundMetricToInt(value, min = SCORE_MIN, max = SCORE_MAX) {
  return Math.max(min, Math.min(max, Math.round(clampMetric(value, min, max))));
}

function normalizeScoreTriplet(input = {}, aliases = {}) {
  return {
    impact: clampMetric(input.impact ?? aliases.impact),
    confidence: clampMetric(
      input.confidence ??
      input.confidenceScore ??
      aliases.confidence ??
      aliases.confidenceScore,
    ),
    effort: clampMetric(
      input.effort ??
      input.weight ??
      input.ease ??
      aliases.effort ??
      aliases.weight ??
      aliases.ease,
    ),
  };
}

function calculateTaskIceScore(input = {}) {
  const { impact, confidence, effort } = normalizeScoreTriplet(input);
  return Number((impact * confidence * effort).toFixed(2));
}

function calculateKnowledgeIceScore(input = {}) {
  const { impact, confidence, effort } = normalizeScoreTriplet(input);
  return Number(((impact * confidence * effort) / KNOWLEDGE_ICE_DIVISOR).toFixed(2));
}

function clampUnit(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return Math.max(0, Math.min(1, fallback));
  }
  return Math.max(0, Math.min(1, numeric));
}

function normalizeIceSignal(iceScore, maxScore = PRIORITY_SCORE_MAX) {
  const numeric = Number(iceScore);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return clampUnit(numeric / maxScore);
}

function computeImpliedFreshnessSignal(input = {}) {
  if (input.freshnessScore !== null && input.freshnessScore !== undefined) {
    return clampUnit(input.freshnessScore);
  }

  const rawDate = input.updatedAt ?? input.createdAt;
  const timestamp = rawDate ? new Date(rawDate).getTime() : Date.now();
  if (!Number.isFinite(timestamp)) return 0.5;

  const windowDays = Number.isFinite(Number(input.freshnessWindowDays))
    ? Math.max(1, Number(input.freshnessWindowDays))
    : 30;
  const ageMs = Math.max(0, Date.now() - timestamp);
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  return Math.max(0.1, clampUnit(1 - ageMs / windowMs));
}

function computeHumanPrioritySignal(input = {}) {
  const feedbackScore = Number(input.feedbackScore ?? 0);
  const feedbackSignal = feedbackScore > 0
    ? Math.min(1, 0.55 + feedbackScore * 0.08)
    : feedbackScore < 0
      ? Math.max(0, 0.45 + feedbackScore * 0.08)
      : 0.5;
  const manualAnchorSignal = Number(input.sortOrder ?? 0) < 0 ? 1 : 0;
  const humanGuidedSignal = String(input.controlMode || "").toUpperCase() === "HUMAN_GUIDED" ? 0.85 : 0;
  return clampUnit(Math.max(feedbackSignal, manualAnchorSignal, humanGuidedSignal));
}

function scoreProfileRationale(input = {}) {
  const rationale = input?.scoreProfile?.rationale;
  return rationale && typeof rationale === "object" ? rationale : null;
}

function deriveQualityPrioritySignal(input = {}, fallback = 0.5) {
  if (input.qualityScore !== null && input.qualityScore !== undefined) {
    return clampUnit(input.qualityScore, fallback);
  }

  const rationale = scoreProfileRationale(input);
  const confidenceSignal = clampMetric(
    input.confidenceScore ??
    input.confidence ??
    input.scoreProfile?.final?.confidence ??
    fallback * SCORE_MAX,
  ) / SCORE_MAX;
  const evidenceSignal = clampUnit(
    rationale?.evidenceStrength ??
    rationale?.sourceConfidenceSignal ??
    rationale?.specificity ??
    rationale?.supportStrength ??
    confidenceSignal,
    confidenceSignal,
  );
  const historySignal = clampUnit(
    rationale?.historyConfidence ??
    rationale?.historySupport ??
    rationale?.historyAcceptance ??
    rationale?.historySuccess ??
    confidenceSignal,
    confidenceSignal,
  );

  return clampUnit(
    confidenceSignal * 0.45 +
    evidenceSignal * 0.30 +
    historySignal * 0.25,
    fallback,
  );
}

function deriveUrgencyPrioritySignal(input = {}, fallback = 0.5) {
  if (input.urgencyScore !== null && input.urgencyScore !== undefined) {
    return clampUnit(input.urgencyScore, fallback);
  }

  const rationale = scoreProfileRationale(input);
  const keywordUrgency = deriveUrgencySignal(input.kind, input.title, input.description) / SCORE_MAX;
  const impactUrgency = clampMetric(
    input.impact ??
    input.scoreProfile?.final?.impact ??
    fallback * SCORE_MAX,
  ) / SCORE_MAX;
  const freshnessUrgency = computeImpliedFreshnessSignal(input);
  const state = String(input.candidateState || "").toUpperCase();
  const scheduledAt = input.scheduledDate ? new Date(input.scheduledDate).getTime() : null;
  const imminentScheduleSignal =
    Number.isFinite(scheduledAt) && scheduledAt <= Date.now() + 3 * 24 * 60 * 60 * 1000 ? 1 : 0;
  const historyUrgency = clampUnit(
    rationale?.historyImpact ??
    rationale?.historyPriority ??
    rationale?.historyDeliveryPressure ??
    impactUrgency,
    impactUrgency,
  );
  const stateUrgency =
    state === "EVALUATED" ? 0.82 :
    state === "REFINED" ? 0.66 :
    state === "GENERATED" ? 0.52 :
    0.46;

  return clampUnit(
    keywordUrgency * 0.28 +
    impactUrgency * 0.26 +
    freshnessUrgency * 0.16 +
    historyUrgency * 0.18 +
    stateUrgency * 0.07 +
    imminentScheduleSignal * 0.05,
    fallback,
  );
}

function computeRiskPrioritySignal(input = {}) {
  const confidence = clampMetric(input.confidenceScore ?? input.confidence ?? 5);
  const activityState = String(input.activityState || "").toUpperCase();
  const processingStatus = String(input.processingStatus || "").toUpperCase();
  const rottenAt = input.rottenAt ? new Date(input.rottenAt).getTime() : null;
  let risk = 0.25;

  if (activityState === "STALE" || activityState === "EXPIRED") risk += 0.2;
  if (processingStatus === "REVIEW" || processingStatus === "DECLINED") risk += 0.18;
  if (Number.isFinite(rottenAt) && rottenAt < Date.now()) risk += 0.2;
  if (confidence <= 4) risk += 0.16;
  if (confidence >= 8) risk -= 0.08;

  return clampUnit(risk);
}

function describePriorityBand(value, high, medium, label) {
  if (value >= high) return `${label}:high`;
  if (value >= medium) return `${label}:medium`;
  return `${label}:low`;
}

function computeBlendedPriorityProfile(input = {}) {
  const iceSignal = normalizeIceSignal(input.iceScore, input.priorityIceMax ?? PRIORITY_SCORE_MAX);
  const qualitySignal = deriveQualityPrioritySignal(input, iceSignal);
  const urgencySignal = deriveUrgencyPrioritySignal(
    input,
    clampMetric(input.impact ?? 5) / SCORE_MAX,
  );
  const freshnessSignal = computeImpliedFreshnessSignal(input);
  const humanSignal = computeHumanPrioritySignal(input);
  const riskSignal = computeRiskPrioritySignal(input);
  const stateMultiplier =
    PRIORITY_STATE_MULTIPLIERS[String(input.candidateState || "").toUpperCase()] ?? 0.78;
  const rawMemoryMultiplier = Number(input.memoryMultiplier ?? input._memoryMultiplier ?? 1);
  const boundedMemoryMultiplier = Number.isFinite(rawMemoryMultiplier)
    ? Math.max(0.6, Math.min(1.4, rawMemoryMultiplier))
    : 1;
  const weighted =
    iceSignal * PRIORITY_WEIGHTS.ice +
    qualitySignal * PRIORITY_WEIGHTS.quality +
    urgencySignal * PRIORITY_WEIGHTS.urgency +
    freshnessSignal * PRIORITY_WEIGHTS.freshness +
    humanSignal * PRIORITY_WEIGHTS.human +
    riskSignal * PRIORITY_WEIGHTS.risk;
  const score = Number((weighted * stateMultiplier * boundedMemoryMultiplier * PRIORITY_SCORE_MAX).toFixed(2));
  const manualAnchor = Number(input.sortOrder ?? 0) < 0;

  return {
    score,
    manualAnchor,
    stateMultiplier,
    memoryMultiplier: boundedMemoryMultiplier,
    components: {
      ice: Number(iceSignal.toFixed(3)),
      quality: Number(qualitySignal.toFixed(3)),
      urgency: Number(urgencySignal.toFixed(3)),
      freshness: Number(freshnessSignal.toFixed(3)),
      human: Number(humanSignal.toFixed(3)),
      risk: Number(riskSignal.toFixed(3)),
    },
    weights: PRIORITY_WEIGHTS,
    reasons: [
      describePriorityBand(iceSignal, 0.7, 0.35, "ice"),
      describePriorityBand(qualitySignal, 0.75, 0.45, "quality"),
      describePriorityBand(urgencySignal, 0.75, 0.45, "urgency"),
      describePriorityBand(freshnessSignal, 0.75, 0.35, "freshness"),
      describePriorityBand(humanSignal, 0.8, 0.55, "human-signal"),
      describePriorityBand(riskSignal, 0.65, 0.35, "risk"),
      manualAnchor ? "manual-anchor:preserved" : "manual-anchor:none",
      `state:${String(input.candidateState || "UNKNOWN").toLowerCase()}`,
    ],
  };
}

function computePriorityCohortProfiles(inputs = [], options = {}) {
  const bucketSize = Number.isFinite(Number(options.bucketSize))
    ? Math.max(5, Number(options.bucketSize))
    : PRIORITY_DENSITY_BUCKET_SIZE;
  const baseProfiles = inputs.map((input, index) => ({
    input,
    index,
    profile: computeBlendedPriorityProfile(input),
  }));

  if (baseProfiles.length <= 1) {
    return baseProfiles.map((entry) => entry.profile);
  }

  const sorted = [...baseProfiles].sort((left, right) => {
    const leftScore = left.profile?.score ?? 0;
    const rightScore = right.profile?.score ?? 0;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return left.index - right.index;
  });

  const bucketCounts = new Map();
  for (const entry of sorted) {
    const bucket = Math.round((entry.profile?.score ?? 0) / bucketSize);
    bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);
  }

  const total = sorted.length;
  const maxBucketCount = Math.max(...bucketCounts.values());
  const adjustedByIndex = new Array(total);
  for (const [rankIndex, entry] of sorted.entries()) {
    const baseScore = entry.profile?.score ?? 0;
    const bucket = Math.round(baseScore / bucketSize);
    const bucketCount = bucketCounts.get(bucket) ?? 1;
    const percentile = total <= 1 ? 1 : 1 - rankIndex / (total - 1);
    const crowdRatio = maxBucketCount > 1 ? (bucketCount - 1) / (maxBucketCount - 1) : 0;
    const spreadBoost = Number(((percentile - 0.5) * 190).toFixed(2));
    const densityPenalty = Number((crowdRatio * 70).toFixed(2));
    const rankTarget = 420 + percentile * 420;
    const rankBlend = Number((((rankTarget - baseScore) * (0.22 + crowdRatio * 0.16))).toFixed(2));
    const anchorBoost = entry.profile?.manualAnchor ? 28 : 0;
    const humanBoost = Number((((entry.profile?.components?.human ?? 0) - 0.5) * 36).toFixed(2));
    const riskBoost = Number((((entry.profile?.components?.risk ?? 0) - 0.35) * 24).toFixed(2));
    const adjustedScore = Number(
      Math.max(
        0,
        Math.min(
          PRIORITY_SCORE_MAX,
          baseScore + spreadBoost + rankBlend + anchorBoost + humanBoost + riskBoost - densityPenalty,
        ),
      ).toFixed(2),
    );

    adjustedByIndex[entry.index] = {
      ...entry.profile,
      baseScore,
      score: adjustedScore,
      cohort: {
        rank: rankIndex + 1,
        total,
        percentile: Number(percentile.toFixed(4)),
        bucket,
        bucketCount,
        spreadBoost,
        rankBlend,
        densityPenalty,
      },
      reasons: [
        ...(entry.profile?.reasons ?? []),
        `rank:${rankIndex + 1}/${total}`,
        bucketCount > 1 ? `density:${bucketCount}` : "density:clear",
      ],
    };
  }

  return adjustedByIndex;
}

function blendScoreTriplets(agentInput = {}, calibratedInput = {}, agentWeight = 0.6) {
  const safeAgentWeight = clampUnit(agentWeight, 0.6);
  const calibratedWeight = 1 - safeAgentWeight;
  const agent = normalizeScoreTriplet(agentInput);
  const calibrated = normalizeScoreTriplet(calibratedInput);

  return {
    agent,
    calibrated,
    final: {
      impact: clampMetricPrecise(agent.impact * safeAgentWeight + calibrated.impact * calibratedWeight),
      confidence: clampMetricPrecise(agent.confidence * safeAgentWeight + calibrated.confidence * calibratedWeight),
      effort: clampMetricPrecise(agent.effort * safeAgentWeight + calibrated.effort * calibratedWeight),
    },
  };
}

function normalizeFactorSignals(input = {}, labels = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input)
      .map(([key, value]) => {
        const signal = clampMetric(value);
        return [
          key,
          {
            label: labels[key] ?? key,
            signal,
          },
        ];
      })
      .filter(([, value]) => Number.isFinite(value.signal)),
  );
}

function normalizeFactorCollection(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {
      impact: {},
      confidence: {},
      effort: {},
    };
  }

  return {
    impact: normalizeFactorSignals(input.impact, input.impactLabels),
    confidence: normalizeFactorSignals(input.confidence, input.confidenceLabels),
    effort: normalizeFactorSignals(input.effort, input.effortLabels),
  };
}

function rankFactorSignals(factors = {}, limit = 3) {
  return Object.entries(factors)
    .map(([key, value]) => ({
      key,
      label: value?.label ?? key,
      signal: clampMetric(value?.signal),
    }))
    .filter((entry) => Number.isFinite(entry.signal))
    .sort((left, right) => right.signal - left.signal)
    .slice(0, limit);
}

function buildFinalFactorCollection(agentTriplet, calibratedTriplet, agentFactors, calibratedFactors, agentWeight) {
  const calibratedWeight = 1 - agentWeight;

  return {
    impact: {
      blendedScore: agentTriplet.impact * agentWeight + calibratedTriplet.impact * calibratedWeight,
      agentScore: agentTriplet.impact,
      calibratedScore: calibratedTriplet.impact,
      dominantSignals: rankFactorSignals(calibratedFactors.impact),
    },
    confidence: {
      blendedScore: agentTriplet.confidence * agentWeight + calibratedTriplet.confidence * calibratedWeight,
      agentScore: agentTriplet.confidence,
      calibratedScore: calibratedTriplet.confidence,
      dominantSignals: rankFactorSignals(calibratedFactors.confidence),
    },
    effort: {
      blendedScore: agentTriplet.effort * agentWeight + calibratedTriplet.effort * calibratedWeight,
      agentScore: agentTriplet.effort,
      calibratedScore: calibratedTriplet.effort,
      dominantSignals: rankFactorSignals(calibratedFactors.effort),
    },
  };
}

function buildScoreProfile(input = {}) {
  const scoreKind = String(input.scoreKind || "TASK").toUpperCase();
  const blend = blendScoreTriplets(input.agent, input.calibrated, input.agentWeight);
  const agentWeight = clampUnit(input.agentWeight, 0.6);
  const agentFactors = normalizeFactorCollection(input.agentFactors);
  const calibratedFactors = normalizeFactorCollection(
    input.calibratedFactors ?? input.calibrated?.factors,
  );
  const finalIceScore = scoreKind === "KNOWLEDGE"
    ? calculateKnowledgeIceScore(blend.final)
    : calculateTaskIceScore(blend.final);
  const quality = buildQualityEnvelope({
    ...input,
    title: input.title ?? input.agent?.title ?? input.calibrated?.title,
    description: input.description ?? input.body ?? input.agent?.description ?? input.calibrated?.description,
    body: input.body ?? input.description ?? input.agent?.body ?? input.calibrated?.body,
    impact: blend.final.impact,
    confidence: blend.final.confidence,
    confidenceScore: blend.final.confidence,
    effort: blend.final.effort,
    weight: blend.final.effort,
    ease: blend.final.effort,
  });

  return {
    version: 3,
    scoreKind,
    agentWeight,
    agent: blend.agent,
    calibrated: blend.calibrated,
    final: {
      impact: blend.final.impact,
      confidence: blend.final.confidence,
      effort: blend.final.effort,
      iceScore: finalIceScore,
    },
    factors: {
      agent: agentFactors,
      calibrated: calibratedFactors,
      final: buildFinalFactorCollection(
        blend.agent,
        blend.calibrated,
        agentFactors,
        calibratedFactors,
        agentWeight,
      ),
    },
    quality,
    rationale: input.rationale || null,
    generatedAt: new Date().toISOString(),
  };
}

function scoreProfileTriplet(profile = {}, fallbacks = {}) {
  const final = profile && typeof profile === "object" ? profile.final : null;
  return normalizeScoreTriplet({
    impact: final?.impact ?? fallbacks.impact,
    confidence: final?.confidence ?? fallbacks.confidence ?? fallbacks.confidenceScore,
    effort: final?.effort ?? final?.ease ?? fallbacks.effort ?? fallbacks.ease ?? fallbacks.weight,
  });
}

function persistTaskScoresFromProfile(profile = {}) {
  const final = scoreProfileTriplet(profile);
  const quality = scoreProfileQuality(profile, final);
  return {
    impact: roundMetricToInt(final.impact),
    confidence: roundMetricToInt(final.confidence),
    confidenceScore: roundMetricToInt(final.confidence),
    ease: roundMetricToInt(final.effort),
    iceScore: Number(calculateTaskIceScore(final).toFixed(2)),
    qualityScore: Number((quality.aggregate / SCORE_MAX).toFixed(4)),
    scoreProfile: {
      ...(profile && typeof profile === "object" ? profile : {}),
      quality: {
        version: 1,
        aggregate: quality.aggregate,
        weakestDimension: quality.weakestDimension,
        dimensions: {
          evidenceQuality: quality.evidenceQuality,
          linguisticQuality: quality.linguisticQuality,
          actionabilityQuality: quality.actionabilityQuality,
          strategicValue: quality.strategicValue,
        },
      },
    },
  };
}

function persistKnowledgeScoresFromProfile(profile = {}) {
  const final = scoreProfileTriplet(profile);
  const quality = scoreProfileQuality(profile, final);
  return {
    impact: roundMetricToInt(final.impact),
    confidence: roundMetricToInt(final.confidence),
    confidenceScore: roundMetricToInt(final.confidence),
    weight: roundMetricToInt(final.effort),
    iceScore: Number(calculateKnowledgeIceScore(final).toFixed(2)),
    scoreProfile: {
      ...(profile && typeof profile === "object" ? profile : {}),
      quality: {
        version: 1,
        aggregate: quality.aggregate,
        weakestDimension: quality.weakestDimension,
        dimensions: {
          evidenceQuality: quality.evidenceQuality,
          linguisticQuality: quality.linguisticQuality,
          actionabilityQuality: quality.actionabilityQuality,
          strategicValue: quality.strategicValue,
        },
      },
    },
  };
}

function normalizeTaskScores(input = {}) {
  const triplet = normalizeScoreTriplet(input);
  const existingProfile = input.scoreProfile && typeof input.scoreProfile === "object" ? input.scoreProfile : null;
  const profile = existingProfile
    ? {
        ...existingProfile,
        scoreKind: existingProfile.scoreKind || "TASK",
        final: {
          impact: triplet.impact,
          confidence: triplet.confidence,
          effort: triplet.effort,
          iceScore: Number(calculateTaskIceScore(triplet).toFixed(2)),
        },
        quality: buildQualityEnvelope({
          ...input,
          impact: triplet.impact,
          confidence: triplet.confidence,
          confidenceScore: triplet.confidence,
          ease: triplet.effort,
          effort: triplet.effort,
        }),
      }
    : buildScoreProfile({
        scoreKind: "TASK",
        ...input,
        agent: {
          impact: triplet.impact,
          confidence: triplet.confidence,
          effort: triplet.effort,
          title: input.title,
          description: input.description,
          body: input.body,
          kind: input.kind,
        },
        calibrated: {
          impact: triplet.impact,
          confidence: triplet.confidence,
          effort: triplet.effort,
          title: input.title,
          description: input.description,
          body: input.body,
          kind: input.kind,
        },
      });
  return persistTaskScoresFromProfile(profile);
}

function normalizeKnowledgeScores(input = {}) {
  const triplet = normalizeScoreTriplet(input);
  const existingProfile = input.scoreProfile && typeof input.scoreProfile === "object" ? input.scoreProfile : null;
  const profile = existingProfile
    ? {
        ...existingProfile,
        scoreKind: existingProfile.scoreKind || "KNOWLEDGE",
        final: {
          impact: triplet.impact,
          confidence: triplet.confidence,
          effort: triplet.effort,
          iceScore: Number(calculateKnowledgeIceScore(triplet).toFixed(2)),
        },
        quality: buildQualityEnvelope({
          ...input,
          impact: triplet.impact,
          confidence: triplet.confidence,
          confidenceScore: triplet.confidence,
          weight: triplet.effort,
          effort: triplet.effort,
        }),
      }
    : buildScoreProfile({
        scoreKind: "KNOWLEDGE",
        ...input,
        agent: {
          impact: triplet.impact,
          confidence: triplet.confidence,
          effort: triplet.effort,
          title: input.title,
          description: input.description,
          body: input.body,
          kind: input.kind,
        },
        calibrated: {
          impact: triplet.impact,
          confidence: triplet.confidence,
          effort: triplet.effort,
          title: input.title,
          description: input.description,
          body: input.body,
          kind: input.kind,
        },
      });
  return persistKnowledgeScoresFromProfile(profile);
}

function normalizeGoalScores(input = {}) {
  return normalizeKnowledgeScores(input);
}

function countKeywordHits(text, keywords) {
  const normalized = String(text || "").toLowerCase();
  return keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0);
}

function deriveSpecificitySignal(title = "", description = "") {
  const text = `${title} ${description}`.trim();
  if (!text) return 1;

  const hasNumber = /\d/.test(text);
  const hasTimeframe = /\b(today|tomorrow|week|month|quarter|q[1-4]|deadline|by\s+\w+)/i.test(text);
  const hasConcreteVerb = /\b(review|audit|contact|launch|update|fix|measure|compare|ship|draft|publish|test|validate)\b/i.test(text);
  let score = 3;
  if (text.length >= 80) score += 2;
  if (text.length >= 160) score += 1;
  if (hasNumber) score += 1;
  if (hasTimeframe) score += 1;
  if (hasConcreteVerb) score += 2;
  return clampMetric(score);
}

function deriveUrgencySignal(kind = "", title = "", description = "") {
  const keywordHits = countKeywordHits(`${title} ${description}`, HIGH_URGENCY_KEYWORDS);
  const kindBoost = ["TASK", "RECOMMENDATION", "FORECAST", "NEWS"].includes(String(kind || "").toUpperCase()) ? 2 : 0;
  return clampMetric(3 + keywordHits + kindBoost);
}

function deriveComplexitySignal(title = "", description = "") {
  const text = `${title} ${description}`.trim();
  const conjunctionHits = (text.match(/\b(and|then|after|before|with)\b/gi) || []).length;
  const punctuationHits = (text.match(/[;,:]/g) || []).length;
  const keywordHits = countKeywordHits(text, COMPLEXITY_KEYWORDS);
  let score = 2;
  if (text.length >= 100) score += 2;
  if (text.length >= 220) score += 1;
  score += Math.min(2, conjunctionHits);
  score += Math.min(2, punctuationHits);
  score += Math.min(3, keywordHits);
  return clampMetric(score);
}

function deriveDependencyLoadSignal(title = "", description = "") {
  const text = `${title} ${description}`.trim();
  const keywordHits = countKeywordHits(text, DEPENDENCY_KEYWORDS);
  const listHits = (text.match(/[,;]/g) || []).length;
  const dependencyPhrases = (text.match(/\bafter\b|\bbefore\b|\brequires\b|\bdepends on\b/gi) || []).length;
  return clampMetric(2 + Math.min(4, keywordHits) + Math.min(2, listHits) + Math.min(2, dependencyPhrases));
}

function deriveCoordinationBurdenSignal(title = "", description = "") {
  const text = `${title} ${description}`.trim();
  const keywordHits = countKeywordHits(text, COORDINATION_KEYWORDS);
  const pluralityHits = (text.match(/\bwith\b|\bacross\b|\band\b/gi) || []).length;
  return clampMetric(2 + Math.min(4, keywordHits) + Math.min(3, pluralityHits));
}

function deriveExpertiseRequirementSignal(title = "", description = "") {
  const text = `${title} ${description}`.trim();
  const keywordHits = countKeywordHits(text, EXPERTISE_KEYWORDS);
  const technicalMarkers = (text.match(/\bapi\b|\bsql\b|\bkpi\b|\bml\b|\bai\b|\bops\b/gi) || []).length;
  return clampMetric(2 + Math.min(4, keywordHits) + Math.min(2, technicalMarkers));
}

function deriveTimeToValueDifficultySignal(title = "", description = "") {
  const text = `${title} ${description}`.trim();
  const keywordHits = countKeywordHits(text, TIME_TO_VALUE_KEYWORDS);
  const timeframeHits = (text.match(/\bweek\b|\bmonth\b|\bquarter\b|\bmilestone\b|\bphase\b/gi) || []).length;
  return clampMetric(2 + Math.min(4, keywordHits) + Math.min(2, timeframeHits));
}

function convertDifficultyToEaseSignal(value) {
  return clampMetric(SCORE_MAX + SCORE_MIN - clampMetric(value) + 1);
}

function deriveEvidenceStrengthSignal(input = {}) {
  const evidence =
    input.evidence && typeof input.evidence === "object"
      ? input.evidence
      : null;
  const hashtags = Array.isArray(input.hashtags) ? input.hashtags : [];
  const title = String(input.title || "");
  const body = String(input.body || input.description || "");
  const urls = Array.isArray(evidence?.urls) ? evidence.urls : [];
  const supportingSourceIds = Array.isArray(evidence?.supportingSourceIds) ? evidence.supportingSourceIds : [];
  const jsonEvidenceLength = evidence ? JSON.stringify(evidence).length : 0;

  let score = 3;
  if (body.length >= 120) score += 2;
  if (body.length >= 260) score += 1;
  if (title.length >= 24) score += 1;
  score += Math.min(2, hashtags.length);
  score += Math.min(2, urls.length);
  score += Math.min(2, supportingSourceIds.length);
  if (jsonEvidenceLength >= 300) score += 1;
  if (jsonEvidenceLength >= 900) score += 1;
  return clampMetric(score);
}

function deriveKnowledgeKindSignal(kind = "") {
  switch (String(kind || "").toUpperCase()) {
    case "PRICE":
    case "RECOMMENDATION":
    case "FORECAST":
      return 9;
    case "CONCLUSION":
    case "EVALUATION":
    case "JUDGMENT":
    case "COMPARISON":
      return 8;
    case "NEWS":
    case "RESEARCH":
      return 7;
    case "EXPLANATION":
    case "SUMMARY":
      return 6;
    case "GOSSIP":
      return 4;
    default:
      return 6;
  }
}

function deriveLinguisticQualitySignal(input = {}) {
  const title = String(input.title || "");
  const body = String(input.body || input.description || "");
  const combined = `${title} ${body}`.trim();
  if (!combined) return 1;

  let score = 4;
  if (title.length >= 12 && title.length <= 110) score += 1.5;
  if (body.length >= 80) score += 1.5;
  if (body.length >= 180) score += 1;
  if (!/\[object Object\]/i.test(combined)) score += 1;
  if (!/\s{3,}/.test(combined)) score += 0.5;
  if (!/[!?]{2,}/.test(combined)) score += 0.5;
  if (/[.?!]/.test(body)) score += 0.5;
  return clampMetric(score);
}

function deriveActionabilityQualitySignal(input = {}) {
  const title = String(input.title || "");
  const body = String(input.body || input.description || "");
  const specificity = deriveSpecificitySignal(title, body);
  const urgency = deriveUrgencySignal(input.kind, title, body);
  const complexity = deriveComplexitySignal(title, body);
  return clampMetric(specificity * 0.5 + urgency * 0.25 + convertDifficultyToEaseSignal(complexity) * 0.25);
}

function deriveStrategicValueSignal(input = {}) {
  const impact = clampMetric(input.impact ?? input.scoreProfile?.final?.impact ?? 5);
  const kindSignal = deriveKnowledgeKindSignal(input.kind);
  const humanSignal = computeHumanPrioritySignal(input) * SCORE_MAX;
  return clampMetric(impact * 0.5 + kindSignal * 0.25 + humanSignal * 0.25);
}

function deriveEvidenceQualitySignal(input = {}) {
  const confidence = clampMetric(input.confidenceScore ?? input.confidence ?? input.scoreProfile?.final?.confidence ?? 5);
  const evidence = deriveEvidenceStrengthSignal(input);
  const rationale = scoreProfileRationale(input);
  const historySupport = clampMetric(
    rationale?.historyConfidence ??
    rationale?.historySupport ??
    rationale?.historyAcceptance ??
    confidence,
  );
  return clampMetric(confidence * 0.4 + evidence * 0.4 + historySupport * 0.2);
}

function buildQualityDimensionScores(input = {}) {
  const evidenceQuality = deriveEvidenceQualitySignal(input);
  const linguisticQuality = deriveLinguisticQualitySignal(input);
  const actionabilityQuality = deriveActionabilityQualitySignal(input);
  const strategicValue = deriveStrategicValueSignal(input);
  const aggregate = clampMetricPrecise(
    evidenceQuality * 0.32 +
    linguisticQuality * 0.22 +
    actionabilityQuality * 0.22 +
    strategicValue * 0.24,
  );
  const dimensions = {
    evidenceQuality,
    linguisticQuality,
    actionabilityQuality,
    strategicValue,
  };
  const weakestDimension = QUALITY_DIMENSION_KEYS.reduce((weakest, key) => {
    if (!weakest) return key;
    return dimensions[key] < dimensions[weakest] ? key : weakest;
  }, null);

  return {
    ...dimensions,
    aggregate,
    weakestDimension,
  };
}

function buildQualityEnvelope(input = {}) {
  const quality = buildQualityDimensionScores(input);
  return {
    version: 1,
    aggregate: quality.aggregate,
    weakestDimension: quality.weakestDimension,
    dimensions: {
      evidenceQuality: quality.evidenceQuality,
      linguisticQuality: quality.linguisticQuality,
      actionabilityQuality: quality.actionabilityQuality,
      strategicValue: quality.strategicValue,
    },
  };
}

function scoreProfileQuality(profile = {}, fallbacks = {}) {
  const quality = profile && typeof profile === "object" ? profile.quality : null;
  if (quality && typeof quality === "object" && quality.dimensions && typeof quality.dimensions === "object") {
    return {
      evidenceQuality: clampMetric(quality.dimensions.evidenceQuality ?? fallbacks.evidenceQuality ?? 5),
      linguisticQuality: clampMetric(quality.dimensions.linguisticQuality ?? fallbacks.linguisticQuality ?? 5),
      actionabilityQuality: clampMetric(quality.dimensions.actionabilityQuality ?? fallbacks.actionabilityQuality ?? 5),
      strategicValue: clampMetric(quality.dimensions.strategicValue ?? fallbacks.strategicValue ?? 5),
      aggregate: clampMetricPrecise(quality.aggregate ?? fallbacks.aggregate ?? 5),
      weakestDimension: String(quality.weakestDimension || fallbacks.weakestDimension || "evidenceQuality"),
    };
  }

  return buildQualityDimensionScores({
    ...fallbacks,
    scoreProfile: profile,
  });
}

function weightedSignalAverage(entries = [], fallback = SCORE_MIN) {
  const normalized = entries
    .map((entry) => {
      if (!entry) return null;
      const value = clampMetric(entry.value ?? entry.signal ?? fallback);
      const weight = Math.max(0, Number(entry.weight ?? 1));
      return weight > 0 ? { value, weight } : null;
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    return clampMetricPrecise(fallback);
  }

  const weightedSum = normalized.reduce((sum, entry) => sum + entry.value * entry.weight, 0);
  const totalWeight = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  return clampMetricPrecise(weightedSum / totalWeight);
}

function groundKnowledgeScores(input = {}) {
  const base = normalizeScoreTriplet(input);
  const specificity = deriveSpecificitySignal(input.title, input.body ?? input.description);
  const evidenceStrength = deriveEvidenceStrengthSignal(input);
  const complexity = deriveComplexitySignal(input.title, input.body ?? input.description);
  const kindSignal = deriveKnowledgeKindSignal(input.kind);
  const sourceImpact = clampMetric(input.sourceImpact ?? base.impact);
  const sourceConfidence = clampMetric(input.sourceConfidence ?? base.confidence);
  const sourceWeight = clampMetric(input.sourceWeight ?? base.effort);
  const topicImpact = input.topicImpact != null ? clampMetric(input.topicImpact) : null;
  const topicConfidence = input.topicConfidence != null ? clampMetric(input.topicConfidence) : null;
  const topicWeight = input.topicWeight != null ? clampMetric(input.topicWeight) : null;
  const historyImpact = input.historyImpact != null ? clampMetric(input.historyImpact) : null;
  const historyConfidence = input.historyConfidence != null ? clampMetric(input.historyConfidence) : null;
  const historySupport = input.historySupport != null ? clampMetric(input.historySupport) : null;

  const factors = {
    impact: {
      baseImpact: base.impact,
      sourceImpact,
      topicImpact: topicImpact ?? kindSignal,
      kindSignal,
      evidenceStrength,
      ...(historyImpact != null ? { historyImpact } : {}),
      ...(historySupport != null ? { historySupport } : {}),
    },
    confidence: {
      baseConfidence: base.confidence,
      sourceConfidence,
      topicConfidence: topicConfidence ?? evidenceStrength,
      evidenceStrength,
      specificity,
      ...(historyConfidence != null ? { historyConfidence } : {}),
      ...(historySupport != null ? { historySupport } : {}),
    },
    effort: {
      baseEffort: base.effort,
      sourceWeight,
      topicWeight: topicWeight ?? complexity,
      complexity,
      evidenceStrength,
    },
  };

  return {
    impact: weightedSignalAverage([
      { value: factors.impact.baseImpact, weight: 2 },
      { value: factors.impact.sourceImpact, weight: 2 },
      { value: factors.impact.topicImpact, weight: 1 },
      { value: factors.impact.kindSignal, weight: 1 },
      { value: factors.impact.evidenceStrength, weight: 1 },
      ...(historyImpact != null ? [{ value: historyImpact, weight: 2 }] : []),
      ...(historySupport != null ? [{ value: historySupport, weight: 1 }] : []),
    ], base.impact),
    confidence: weightedSignalAverage([
      { value: factors.confidence.baseConfidence, weight: 2 },
      { value: factors.confidence.sourceConfidence, weight: 2 },
      { value: factors.confidence.topicConfidence, weight: 1 },
      { value: factors.confidence.evidenceStrength, weight: 1 },
      { value: factors.confidence.specificity, weight: 1 },
      ...(historyConfidence != null ? [{ value: historyConfidence, weight: 2 }] : []),
      ...(historySupport != null ? [{ value: historySupport, weight: 1 }] : []),
    ], base.confidence),
    effort: clampMetricPrecise(
      (
        factors.effort.baseEffort * 2 +
        factors.effort.sourceWeight * 2 +
        factors.effort.topicWeight +
        factors.effort.complexity +
        factors.effort.evidenceStrength
      ) / 7,
    ),
    factors,
  };
}

function groundTaskScores(input = {}) {
  const base = normalizeScoreTriplet(input);
  const sourceImpact = clampMetric(input.sourceImpact ?? input.flashcardImpact ?? base.impact);
  const sourceConfidence = clampMetric(input.sourceConfidence ?? input.flashcardConfidence ?? base.confidence);
  const sourceWeight = clampMetric(input.sourceWeight ?? input.flashcardWeight ?? base.effort);
  const sourceIceScore = Number.isFinite(Number(input.sourceIceScore)) ? Number(input.sourceIceScore) : null;
  const sourceIceSignal = sourceIceScore == null ? null : clampMetric(sourceIceScore / KNOWLEDGE_ICE_DIVISOR);
  const specificity = deriveSpecificitySignal(input.title, input.description);
  const urgency = deriveUrgencySignal(input.kind, input.title, input.description);
  const complexity = deriveComplexitySignal(input.title, input.description);
  const dependencyLoad = deriveDependencyLoadSignal(input.title, input.description);
  const coordinationBurden = deriveCoordinationBurdenSignal(input.title, input.description);
  const expertiseRequirement = deriveExpertiseRequirementSignal(input.title, input.description);
  const timeToValueDifficulty = deriveTimeToValueDifficultySignal(input.title, input.description);
  const deliveryDifficulty = weightedSignalAverage([
    { value: complexity, weight: 2 },
    { value: dependencyLoad, weight: 2 },
    { value: coordinationBurden, weight: 2 },
    { value: expertiseRequirement, weight: 2 },
    { value: timeToValueDifficulty, weight: 1 },
  ], complexity);
  const deliveryEaseSignal = convertDifficultyToEaseSignal(deliveryDifficulty);
  const historyImpact = input.historyImpact != null ? clampMetric(input.historyImpact) : null;
  const historyConfidence = input.historyConfidence != null ? clampMetric(input.historyConfidence) : null;
  const historySupport = input.historySupport != null ? clampMetric(input.historySupport) : null;
  const historyEase = input.historyEase != null ? clampMetric(input.historyEase) : null;
  const historyDifficulty = input.historyDifficulty != null ? clampMetric(input.historyDifficulty) : null;
  const historyDifficultyEase = historyDifficulty == null ? null : convertDifficultyToEaseSignal(historyDifficulty);

  const factors = {
    impact: {
      baseImpact: base.impact,
      sourceImpact,
      urgency,
      sourceIceSignal: sourceIceSignal ?? urgency,
      ...(historyImpact != null ? { historyImpact } : {}),
      ...(historySupport != null ? { historySupport } : {}),
    },
    confidence: {
      baseConfidence: base.confidence,
      sourceConfidence,
      specificity,
      sourceIceSignal: sourceIceSignal ?? specificity,
      ...(historyConfidence != null ? { historyConfidence } : {}),
      ...(historySupport != null ? { historySupport } : {}),
    },
    effort: {
      baseEffort: base.effort,
      sourceWeight,
      complexity,
      sourceIceSignal: sourceIceSignal ?? deliveryEaseSignal,
      dependencyLoad,
      coordinationBurden,
      expertiseRequirement,
      timeToValueDifficulty,
      deliveryDifficulty,
      deliveryEaseSignal,
      ...(historyEase != null ? { historyEase } : {}),
      ...(historyDifficulty != null ? { historyDifficulty } : {}),
      ...(historyDifficultyEase != null ? { historyDifficultyEase } : {}),
    },
  };

  return {
    impact: weightedSignalAverage([
      { value: factors.impact.baseImpact, weight: 3 },
      { value: factors.impact.sourceImpact, weight: 2 },
      { value: factors.impact.urgency, weight: 1 },
      { value: factors.impact.sourceIceSignal, weight: 1 },
      ...(historyImpact != null ? [{ value: historyImpact, weight: 2 }] : []),
      ...(historySupport != null ? [{ value: historySupport, weight: 1 }] : []),
    ], base.impact),
    confidence: weightedSignalAverage([
      { value: factors.confidence.baseConfidence, weight: 2 },
      { value: factors.confidence.sourceConfidence, weight: 2 },
      { value: factors.confidence.specificity, weight: 1 },
      { value: factors.confidence.sourceIceSignal, weight: 1 },
      ...(historyConfidence != null ? [{ value: historyConfidence, weight: 2 }] : []),
      ...(historySupport != null ? [{ value: historySupport, weight: 1 }] : []),
    ], base.confidence),
    effort: weightedSignalAverage([
      { value: factors.effort.baseEffort, weight: 2 },
      { value: factors.effort.sourceWeight, weight: 1 },
      { value: factors.effort.deliveryEaseSignal, weight: 2 },
      { value: factors.effort.sourceIceSignal, weight: 1 },
      ...(historyEase != null ? [{ value: historyEase, weight: 2 }] : []),
      ...(historyDifficultyEase != null ? [{ value: historyDifficultyEase, weight: 1.5 }] : []),
    ], base.effort),
    factors,
  };
}

function enrichTaskDraftScores(input = {}) {
  return groundTaskScores(input);
}

module.exports = {
  SCORE_MIN,
  SCORE_MAX,
  KNOWLEDGE_ICE_DIVISOR,
  PRIORITY_SCORE_MAX,
  PRIORITY_WEIGHTS,
  PRIORITY_STATE_MULTIPLIERS,
  clampMetric,
  clampUnit,
  normalizeScoreTriplet,
  calculateTaskIceScore,
  calculateKnowledgeIceScore,
  normalizeIceSignal,
  computeImpliedFreshnessSignal,
  computeHumanPrioritySignal,
  computeRiskPrioritySignal,
  computeBlendedPriorityProfile,
  computePriorityCohortProfiles,
  blendScoreTriplets,
  buildScoreProfile,
  buildQualityEnvelope,
  buildQualityDimensionScores,
  scoreProfileQuality,
  scoreProfileTriplet,
  persistTaskScoresFromProfile,
  persistKnowledgeScoresFromProfile,
  normalizeTaskScores,
  normalizeKnowledgeScores,
  normalizeGoalScores,
  deriveSpecificitySignal,
  deriveUrgencySignal,
  deriveComplexitySignal,
  deriveDependencyLoadSignal,
  deriveCoordinationBurdenSignal,
  deriveExpertiseRequirementSignal,
  deriveTimeToValueDifficultySignal,
  deriveEvidenceStrengthSignal,
  deriveKnowledgeKindSignal,
  groundKnowledgeScores,
  groundTaskScores,
  enrichTaskDraftScores,
};
