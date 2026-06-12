export const VISITOR_CAPABILITY_SCOPES = [
  "check",
  "check.miniapp",
  "check.miniapp.visitors",
  "check.miniapp.visitors.compare",
] as const;

export type VisitorCapabilityScope = (typeof VISITOR_CAPABILITY_SCOPES)[number];

export type VisitorCapabilityRule = {
  id: string;
  scope: VisitorCapabilityScope;
  version: string;
  appliesTo: string[];
  precedence: number;
  sourceDatacardId?: string;
};

export type EffectiveVisitorCapability = {
  scope: VisitorCapabilityScope;
  parentChain: VisitorCapabilityScope[];
  rules: VisitorCapabilityRule[];
  resolvedAt: string;
  diagnostics: string[];
};

const SCOPE_SET = new Set<string>(VISITOR_CAPABILITY_SCOPES);

const PARENT_CHAIN_BY_SCOPE: Record<VisitorCapabilityScope, VisitorCapabilityScope[]> = {
  check: ["check"],
  "check.miniapp": ["check", "check.miniapp"],
  "check.miniapp.visitors": ["check", "check.miniapp", "check.miniapp.visitors"],
  "check.miniapp.visitors.compare": ["check", "check.miniapp", "check.miniapp.visitors", "check.miniapp.visitors.compare"],
};

export const DEFAULT_VISITOR_CAPABILITY_RULES: VisitorCapabilityRule[] = [
  {
    id: "stable-card-identity",
    scope: "check",
    version: "v1",
    appliesTo: ["cards", "sources", "publishing"],
    precedence: 100,
  },
  {
    id: "source-backed-publication",
    scope: "check.miniapp",
    version: "v1",
    appliesTo: ["miniapp-publication", "review-cards", "public-verification"],
    precedence: 200,
  },
  {
    id: "visitor-primary-category",
    scope: "check.miniapp.visitors",
    version: "v1",
    appliesTo: ["classification", "filtering", "maintenance"],
    precedence: 300,
  },
  {
    id: "visitor-category-affinity",
    scope: "check.miniapp.visitors",
    version: "v1",
    appliesTo: ["classification", "view-eligibility", "duplicate-prevention"],
    precedence: 310,
  },
  {
    id: "visitor-localized-public-copy",
    scope: "check.miniapp.visitors",
    version: "v1",
    appliesTo: ["localization", "maintenance", "quality-gates"],
    precedence: 320,
  },
  {
    id: "compare-shooting-taxonomy",
    scope: "check.miniapp.visitors.compare",
    version: "v1",
    appliesTo: ["ranges", "training", "competitions", "hunting", "clubs"],
    precedence: 400,
  },
];

function normalizeScopeKey(value: string) {
  return String(value || "").trim().toLowerCase();
}

export function isVisitorCapabilityScope(value: string): value is VisitorCapabilityScope {
  return SCOPE_SET.has(normalizeScopeKey(value));
}

export function normalizeVisitorCapabilityScope(value: string): VisitorCapabilityScope {
  const normalized = normalizeScopeKey(value);
  if (!isVisitorCapabilityScope(normalized)) {
    throw new Error(`Unsupported visitor capability scope "${value}".`);
  }
  return normalized;
}

export function resolveVisitorCapabilityScopeForVisitorKey(visitorKeyRaw: string): VisitorCapabilityScope {
  const visitorKey = normalizeScopeKey(visitorKeyRaw);
  if (visitorKey === "compare" || visitorKey.includes("compare")) return "check.miniapp.visitors.compare";
  throw new Error(`Unsupported visitorKey "${visitorKeyRaw}". Expected compare visitor.`);
}

export function expandVisitorCapabilityParentChain(scopeRaw: string): VisitorCapabilityScope[] {
  const scope = normalizeVisitorCapabilityScope(scopeRaw);
  return [...PARENT_CHAIN_BY_SCOPE[scope]];
}

function validateRule(rule: VisitorCapabilityRule) {
  normalizeVisitorCapabilityScope(rule.scope);
  if (!rule.id.trim()) throw new Error("Visitor capability rule id is required.");
  if (!rule.version.trim()) throw new Error(`Visitor capability rule ${rule.id} version is required.`);
  if (!Number.isFinite(rule.precedence)) throw new Error(`Visitor capability rule ${rule.id} precedence must be finite.`);
  if (!Array.isArray(rule.appliesTo)) throw new Error(`Visitor capability rule ${rule.id} appliesTo must be an array.`);
}

function resolveRulesForChain(parentChain: VisitorCapabilityScope[], rules: VisitorCapabilityRule[]) {
  const allowedScopes = new Set(parentChain);
  const byId = new Map<string, VisitorCapabilityRule>();
  const diagnostics: string[] = [];

  for (const rule of rules) {
    validateRule(rule);
    if (!allowedScopes.has(rule.scope)) continue;
    const existing = byId.get(rule.id);
    if (existing && existing.scope !== rule.scope) {
      diagnostics.push(`Rule ${rule.id} from ${rule.scope} overrides ${existing.scope}.`);
    }
    byId.set(rule.id, {
      ...rule,
      appliesTo: [...rule.appliesTo],
    });
  }

  return {
    rules: [...byId.values()].sort((left, right) => left.precedence - right.precedence || left.id.localeCompare(right.id)),
    diagnostics,
  };
}

export function resolveVisitorCapability(
  scopeRaw: string,
  rules: VisitorCapabilityRule[] = DEFAULT_VISITOR_CAPABILITY_RULES,
): EffectiveVisitorCapability {
  const scope = normalizeVisitorCapabilityScope(scopeRaw);
  const parentChain = expandVisitorCapabilityParentChain(scope);
  const resolved = resolveRulesForChain(parentChain, rules);

  return {
    scope,
    parentChain,
    rules: resolved.rules,
    resolvedAt: new Date().toISOString(),
    diagnostics: resolved.diagnostics,
  };
}

export function resolveVisitorCapabilityForVisitorKey(
  visitorKey: string,
  rules: VisitorCapabilityRule[] = DEFAULT_VISITOR_CAPABILITY_RULES,
): EffectiveVisitorCapability {
  return resolveVisitorCapability(resolveVisitorCapabilityScopeForVisitorKey(visitorKey), rules);
}
