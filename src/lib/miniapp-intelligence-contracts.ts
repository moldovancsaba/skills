import type { DestinationKey } from "@/lib/destination-workflow-contract";
import { normalizeDestinationKey } from "@/lib/destination-scope";
import { MINIAPP_DEFAULT_MINIMUM_CONTENT_QUALITY_SCORE, MINIAPP_CONTENT_QUALITY_SCORE_MAX } from "@/lib/miniapp-content-quality";

export type MiniappEvidenceType = "official_site" | "directory" | "event_page" | "association_page" | "public_catalog";

export type MiniappIntelligenceContract = {
  key: string;
  miniappKey: string;
  destinationKey: DestinationKey;
  schemaVersion: "sovereign-miniapp-intelligence@v1";
  domainProfile: {
    title: string;
    description: string;
    allowedContentTypes: string[];
    forbiddenSignals: string[];
  };
  coverageGoals: Array<{
    id: string;
    category: string;
    geography?: string;
    targetVisibleCards: number;
    priority: number;
  }>;
  researchPolicy: {
    allowedSearchProviders: string[];
    requireOfficialSource: boolean;
    maxDomainRetries: number;
    crawlDepth: number;
    timeoutMs: number;
    maxResultsPerTask: number;
    expectedEvidenceTypes: MiniappEvidenceType[];
  };
  promotionPolicy: {
    minimumEvidenceScore: number;
    minimumSourceAuthorityScore: number;
    minimumCandidateScore: number;
    minimumContentQualityScore: number;
    requirePublicVerification: boolean;
    successMetric: "verified_public_visible_cards";
    sourceCardInventoryIsSuccess: false;
  };
  failurePolicy: {
    retryableCodes: string[];
    terminalCodes: string[];
    learningMemoryCodes: string[];
  };
  verificationPolicy: {
    publicApiRequired: boolean;
    visibleCardTargetField: "publicVisibleCards";
    countDuplicateUpdatesAsNewCards: false;
  };
};

export type MiniappContractValidation = {
  valid: boolean;
  errors: string[];
};

export type ResolvedMiniappIntelligenceContract = {
  contract: MiniappIntelligenceContract;
  validation: MiniappContractValidation;
};

function normalizeKey(value: string) {
  return String(value || "").trim().toLowerCase();
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function validatePositiveNumber(value: number, path: string, errors: string[]) {
  if (!Number.isFinite(value) || value <= 0) {
    errors.push(`${path} must be a positive number`);
  }
}

function validateContentQualityThreshold(value: number, path: string, errors: string[]) {
  validatePositiveNumber(value, path, errors);
  if (value > MINIAPP_CONTENT_QUALITY_SCORE_MAX) {
    errors.push(`${path} must be <= ${MINIAPP_CONTENT_QUALITY_SCORE_MAX}`);
  }
}

export function validateMiniappIntelligenceContract(contract: MiniappIntelligenceContract): MiniappContractValidation {
  const errors: string[] = [];

  if (!contract || typeof contract !== "object") {
    return { valid: false, errors: ["contract must be an object"] };
  }
  if (!contract.key.trim()) errors.push("key is required");
  if (!contract.miniappKey.trim()) errors.push("miniappKey is required");
  if (!normalizeDestinationKey(contract.destinationKey)) errors.push("destinationKey must be supported");
  if (contract.schemaVersion !== "sovereign-miniapp-intelligence@v1") {
    errors.push("schemaVersion must be sovereign-miniapp-intelligence@v1");
  }

  if (!contract.domainProfile.title.trim()) errors.push("domainProfile.title is required");
  if (!contract.domainProfile.description.trim()) errors.push("domainProfile.description is required");
  if (!contract.domainProfile.allowedContentTypes.length) {
    errors.push("domainProfile.allowedContentTypes must be non-empty");
  }

  if (!contract.coverageGoals.length) {
    errors.push("coverageGoals must be non-empty");
  }
  for (const [index, goal] of contract.coverageGoals.entries()) {
    if (!goal.id.trim()) errors.push(`coverageGoals[${index}].id is required`);
    if (!goal.category.trim()) errors.push(`coverageGoals[${index}].category is required`);
    validatePositiveNumber(goal.targetVisibleCards, `coverageGoals[${index}].targetVisibleCards`, errors);
    validatePositiveNumber(goal.priority, `coverageGoals[${index}].priority`, errors);
  }

  if (!contract.researchPolicy.allowedSearchProviders.length) {
    errors.push("researchPolicy.allowedSearchProviders must be non-empty");
  }
  validatePositiveNumber(contract.researchPolicy.maxDomainRetries, "researchPolicy.maxDomainRetries", errors);
  validatePositiveNumber(contract.researchPolicy.crawlDepth, "researchPolicy.crawlDepth", errors);
  validatePositiveNumber(contract.researchPolicy.timeoutMs, "researchPolicy.timeoutMs", errors);
  validatePositiveNumber(contract.researchPolicy.maxResultsPerTask, "researchPolicy.maxResultsPerTask", errors);
  if (!contract.researchPolicy.expectedEvidenceTypes.length) {
    errors.push("researchPolicy.expectedEvidenceTypes must be non-empty");
  }

  validatePositiveNumber(contract.promotionPolicy.minimumEvidenceScore, "promotionPolicy.minimumEvidenceScore", errors);
  validatePositiveNumber(contract.promotionPolicy.minimumSourceAuthorityScore, "promotionPolicy.minimumSourceAuthorityScore", errors);
  validatePositiveNumber(contract.promotionPolicy.minimumCandidateScore, "promotionPolicy.minimumCandidateScore", errors);
  validateContentQualityThreshold(contract.promotionPolicy.minimumContentQualityScore, "promotionPolicy.minimumContentQualityScore", errors);
  if (contract.promotionPolicy.successMetric !== "verified_public_visible_cards") {
    errors.push("promotionPolicy.successMetric must be verified_public_visible_cards");
  }
  if (contract.promotionPolicy.sourceCardInventoryIsSuccess !== false) {
    errors.push("promotionPolicy.sourceCardInventoryIsSuccess must be false");
  }
  if (contract.verificationPolicy.countDuplicateUpdatesAsNewCards !== false) {
    errors.push("verificationPolicy.countDuplicateUpdatesAsNewCards must be false");
  }

  const retryable = new Set(contract.failurePolicy.retryableCodes);
  const overlap = contract.failurePolicy.terminalCodes.filter((code) => retryable.has(code));
  if (overlap.length) {
    errors.push(`failurePolicy retryable/terminal overlap: ${overlap.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

const COMMON_FAILURE_POLICY = {
  retryableCodes: [
    "provider_timeout",
    "fetch_failed",
    "thin_page",
    "missing_media",
    "missing_address",
    "prepare_failed_retryable",
  ],
  terminalCodes: [
    "forbidden_signal",
    "wrong_industry",
    "unsafe_or_sensitive",
    "duplicate_existing_public_card",
    "schema_validation_failed_terminal",
  ],
  learningMemoryCodes: [
    "no_results",
    "weak_candidate",
    "prepare_review_blocked",
    "publish_blocked",
    "public_visibility_failed",
    "domain_retry_budget_exhausted",
  ],
};

const CONTRACTS: Record<string, MiniappIntelligenceContract> = {
  compare: {
    key: "compare.visitor.sovereign@v1",
    miniappKey: "compare",
    destinationKey: "compare",
    schemaVersion: "sovereign-miniapp-intelligence@v1",
    domainProfile: {
      title: "Compare Visitor",
      description:
        "Research-backed public visitor content for sport shooting, shooting ranges, competitions, hunting associations, hunting courses, and hunting expos.",
      allowedContentTypes: [
        "Shooting Ranges",
        "Sport Shooting Clubs",
        "Shooting Courses",
        "Competitions",
        "Hunting Associations",
        "Hunting Courses",
        "Hunting Expos",
      ],
      forbiddenSignals: [
        "birthday",
        "kids camp",
        "generic travel guide",
        "golf-only venue",
        "source-only policy page",
      ],
    },
    coverageGoals: [
      { id: "compare-hungary-shooting-ranges", category: "Shooting Ranges", geography: "Hungary", targetVisibleCards: 40, priority: 100 },
      { id: "compare-hungary-sport-clubs", category: "Sport Shooting Clubs", geography: "Hungary", targetVisibleCards: 20, priority: 90 },
      { id: "compare-hungary-courses", category: "Shooting Courses", geography: "Hungary", targetVisibleCards: 15, priority: 85 },
      { id: "compare-hungary-competitions", category: "Competitions", geography: "Hungary", targetVisibleCards: 15, priority: 75 },
      { id: "compare-hungary-hunting", category: "Hunting Associations", geography: "Hungary", targetVisibleCards: 10, priority: 70 },
    ],
    researchPolicy: {
      allowedSearchProviders: ["duckduckgo", "bing-html", "seed-fallback"],
      requireOfficialSource: true,
      maxDomainRetries: 2,
      crawlDepth: 2,
      timeoutMs: 15000,
      maxResultsPerTask: 8,
      expectedEvidenceTypes: ["official_site", "event_page", "association_page", "directory"],
    },
    promotionPolicy: {
      minimumEvidenceScore: 60,
      minimumSourceAuthorityScore: 70,
      minimumCandidateScore: 70,
      minimumContentQualityScore: MINIAPP_DEFAULT_MINIMUM_CONTENT_QUALITY_SCORE,
      requirePublicVerification: true,
      successMetric: "verified_public_visible_cards",
      sourceCardInventoryIsSuccess: false,
    },
    failurePolicy: COMMON_FAILURE_POLICY,
    verificationPolicy: {
      publicApiRequired: true,
      visibleCardTargetField: "publicVisibleCards",
      countDuplicateUpdatesAsNewCards: false,
    },
  },
  trainers: {
    key: "trainers.training-services.sovereign@v1",
    miniappKey: "trainers",
    destinationKey: "trainers",
    schemaVersion: "sovereign-miniapp-intelligence@v1",
    domainProfile: {
      title: "Trainers Training Services",
      description:
        "Verified sport clubs, training academies, coaching services, and youth sport programs for athlete habit and training support.",
      allowedContentTypes: [
        "Sport Academies",
        "Training Clubs",
        "Coaching Services",
        "Youth Sport Programs",
        "Fitness Centers",
      ],
      forbiddenSignals: [
        "adult-only venue",
        "generic travel guide",
        "source-only policy page",
        "non-sport commercial",
      ],
    },
    coverageGoals: [
      { id: "trainers-sport-academies", category: "Sport Academies", geography: "Hungary", targetVisibleCards: 30, priority: 100 },
      { id: "trainers-training-clubs", category: "Training Clubs", geography: "Hungary", targetVisibleCards: 30, priority: 90 },
      { id: "trainers-coaching-services", category: "Coaching Services", geography: "Hungary", targetVisibleCards: 20, priority: 80 },
      { id: "trainers-youth-sport", category: "Youth Sport Programs", geography: "Hungary", targetVisibleCards: 20, priority: 70 },
    ],
    researchPolicy: {
      allowedSearchProviders: ["duckduckgo", "bing-html", "seed-fallback"],
      requireOfficialSource: true,
      maxDomainRetries: 2,
      crawlDepth: 2,
      timeoutMs: 15000,
      maxResultsPerTask: 8,
      expectedEvidenceTypes: ["official_site", "association_page", "directory"],
    },
    promotionPolicy: {
      minimumEvidenceScore: 60,
      minimumSourceAuthorityScore: 65,
      minimumCandidateScore: 70,
      minimumContentQualityScore: MINIAPP_DEFAULT_MINIMUM_CONTENT_QUALITY_SCORE,
      requirePublicVerification: true,
      successMetric: "verified_public_visible_cards",
      sourceCardInventoryIsSuccess: false,
    },
    failurePolicy: COMMON_FAILURE_POLICY,
    verificationPolicy: {
      publicApiRequired: true,
      visibleCardTargetField: "publicVisibleCards",
      countDuplicateUpdatesAsNewCards: false,
    },
  },
  athleteiq: {
    key: "athleteiq.trainers.sovereign@v1",
    miniappKey: "athleteiq",
    destinationKey: "athleteiq",
    schemaVersion: "sovereign-miniapp-intelligence@v1",
    domainProfile: {
      title: "AthleteIQ Trainers",
      description:
        "Verified football academies, sport academies, coaching services, youth sport programs, and performance centres for athlete development.",
      allowedContentTypes: [
        "Football Academies",
        "Sport Academies",
        "Coaching Services",
        "Youth Sport Programs",
        "Performance Centres",
        "Training Clubs",
      ],
      forbiddenSignals: [
        "adult-only venue",
        "generic travel guide",
        "source-only policy page",
        "non-sport commercial",
        "spectator-only venue",
      ],
    },
    coverageGoals: [
      { id: "athleteiq-football-academies", category: "Football Academies", geography: "Hungary", targetVisibleCards: 30, priority: 100 },
      { id: "athleteiq-sport-academies", category: "Sport Academies", geography: "Hungary", targetVisibleCards: 25, priority: 90 },
      { id: "athleteiq-coaching-services", category: "Coaching Services", geography: "Hungary", targetVisibleCards: 20, priority: 85 },
      { id: "athleteiq-youth-programs", category: "Youth Sport Programs", geography: "Hungary", targetVisibleCards: 20, priority: 80 },
      { id: "athleteiq-performance-centres", category: "Performance Centres", geography: "Hungary", targetVisibleCards: 15, priority: 70 },
    ],
    researchPolicy: {
      allowedSearchProviders: ["duckduckgo", "bing-html", "seed-fallback"],
      requireOfficialSource: true,
      maxDomainRetries: 2,
      crawlDepth: 2,
      timeoutMs: 15000,
      maxResultsPerTask: 8,
      expectedEvidenceTypes: ["official_site", "association_page", "directory"],
    },
    promotionPolicy: {
      minimumEvidenceScore: 60,
      minimumSourceAuthorityScore: 65,
      minimumCandidateScore: 70,
      minimumContentQualityScore: MINIAPP_DEFAULT_MINIMUM_CONTENT_QUALITY_SCORE,
      requirePublicVerification: true,
      successMetric: "verified_public_visible_cards",
      sourceCardInventoryIsSuccess: false,
    },
    failurePolicy: COMMON_FAILURE_POLICY,
    verificationPolicy: {
      publicApiRequired: true,
      visibleCardTargetField: "publicVisibleCards",
      countDuplicateUpdatesAsNewCards: false,
    },
  },
};

export function listMiniappIntelligenceContracts(): ResolvedMiniappIntelligenceContract[] {
  return Object.values(CONTRACTS).map((contract) => ({
    contract,
    validation: validateMiniappIntelligenceContract(contract),
  }));
}

export function resolveMiniappIntelligenceContract(input: {
  miniappKey?: string;
  visitorKey?: string;
  destinationKeyHint?: unknown;
}): ResolvedMiniappIntelligenceContract {
  const rawKey = normalizeKey(input.miniappKey || input.visitorKey || "");
  const destinationKey =
    normalizeDestinationKey(input.destinationKeyHint) ??
    (rawKey.includes("compare") ? "compare" : rawKey.includes("athleteiq") ? "athleteiq" : rawKey.includes("trainers") ? "trainers" : null);
  const contractKey = destinationKey ?? (rawKey.includes("compare") ? "compare" : rawKey.includes("athleteiq") ? "athleteiq" : rawKey.includes("trainers") ? "trainers" : rawKey);
  const contract = CONTRACTS[contractKey];

  if (!contract) {
    const fallbackDestination = destinationKey ?? "compare";
    const fallback: MiniappIntelligenceContract = {
      ...CONTRACTS.compare,
      key: `${rawKey || "unknown"}.visitor.sovereign@compat`,
      miniappKey: rawKey || "unknown",
      destinationKey: fallbackDestination,
      domainProfile: {
        ...CONTRACTS.compare.domainProfile,
        title: rawKey || "Unknown Miniapp",
        description: "Compatibility contract for a miniapp that has not declared sovereign intelligence policy.",
      },
      coverageGoals: [],
    };
    return {
      contract: fallback,
      validation: {
        valid: false,
        errors: [`No sovereign miniapp intelligence contract registered for "${rawKey || "unknown"}".`],
      },
    };
  }

  const normalizedContract: MiniappIntelligenceContract = {
    ...contract,
    domainProfile: {
      ...contract.domainProfile,
      allowedContentTypes: unique(contract.domainProfile.allowedContentTypes),
      forbiddenSignals: unique(contract.domainProfile.forbiddenSignals),
    },
    failurePolicy: {
      retryableCodes: unique(contract.failurePolicy.retryableCodes),
      terminalCodes: unique(contract.failurePolicy.terminalCodes),
      learningMemoryCodes: unique(contract.failurePolicy.learningMemoryCodes),
    },
  };

  return {
    contract: normalizedContract,
    validation: validateMiniappIntelligenceContract(normalizedContract),
  };
}

export function assertMiniappIntelligenceContract(input: {
  miniappKey?: string;
  visitorKey?: string;
  destinationKeyHint?: unknown;
}) {
  const resolved = resolveMiniappIntelligenceContract(input);
  if (!resolved.validation.valid) {
    throw new Error(`Invalid miniapp intelligence contract: ${resolved.validation.errors.join("; ")}`);
  }
  return resolved.contract;
}
