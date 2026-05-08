const FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const POST_CREATION_THRESHOLD_MS = 1000;

export type CardFreshnessState = "NEW" | "UPDATED";
export type FreshnessDateValue = Date | string | null | undefined;

type CardFreshnessInput = {
  createdAt?: FreshnessDateValue;
  updatedAt?: FreshnessDateValue;
  aiTouchedAt?: FreshnessDateValue;
  humanTouchedAt?: FreshnessDateValue;
};

type FeedbackDrivenFreshnessInput = CardFreshnessInput & {
  refreshedAt?: FreshnessDateValue;
  lastActionAt?: FreshnessDateValue;
};

export type DataCardFreshnessInput = {
  createdAt?: FreshnessDateValue;
  updatedAt?: FreshnessDateValue;
};

export type TopicCardFreshnessInput = {
  createdAt?: FreshnessDateValue;
  updatedAt?: FreshnessDateValue;
};

export type IntelligenceCardFreshnessInput = {
  createdAt?: FreshnessDateValue;
  updatedAt?: FreshnessDateValue;
  refreshedAt?: FreshnessDateValue;
  lastActionAt?: FreshnessDateValue;
};

export type TaskCardFreshnessInput = {
  createdAt?: FreshnessDateValue;
  updatedAt?: FreshnessDateValue;
  generatedAt?: FreshnessDateValue;
};

function toDate(value: FreshnessDateValue) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinFreshnessWindow(value: Date | null, now: Date) {
  if (!value) {
    return false;
  }

  const delta = now.getTime() - value.getTime();
  return delta >= 0 && delta <= FRESHNESS_WINDOW_MS;
}

function isPostCreationTouch(createdAt: Date | null, touchAt: Date | null) {
  if (!touchAt) {
    return false;
  }

  if (!createdAt) {
    return true;
  }

  return touchAt.getTime() - createdAt.getTime() > POST_CREATION_THRESHOLD_MS;
}

function getMostRecentDate(...values: Array<Date | null>) {
  return values.reduce<Date | null>((latest, value) => {
    if (!value) {
      return latest;
    }

    if (!latest || value.getTime() > latest.getTime()) {
      return value;
    }

    return latest;
  }, null);
}

export function getCardFreshnessState(input: CardFreshnessInput, now = new Date()): CardFreshnessState | null {
  const createdAt = toDate(input.createdAt);
  const updatedAt = toDate(input.updatedAt);
  const aiTouchedAt = toDate(input.aiTouchedAt);
  const humanTouchedAt = toDate(input.humanTouchedAt);

  const postCreationAiTouch = isPostCreationTouch(createdAt, aiTouchedAt) ? aiTouchedAt : null;
  const postCreationHumanTouch = isPostCreationTouch(createdAt, humanTouchedAt) ? humanTouchedAt : null;
  const fallbackUpdatedTouch =
    isPostCreationTouch(createdAt, updatedAt) &&
    (!postCreationAiTouch || updatedAt!.getTime() > postCreationAiTouch.getTime()) &&
    (!postCreationHumanTouch || updatedAt!.getTime() > postCreationHumanTouch.getTime())
      ? updatedAt
      : null;

  const latestTouch = getMostRecentDate(postCreationAiTouch, postCreationHumanTouch, fallbackUpdatedTouch);

  if (isWithinFreshnessWindow(latestTouch, now)) {
    return "UPDATED";
  }

  if (createdAt && isWithinFreshnessWindow(createdAt, now) && !latestTouch) {
    return "NEW";
  }

  return null;
}

function getFeedbackDrivenFreshness(input: FeedbackDrivenFreshnessInput, now = new Date()) {
  return getCardFreshnessState(
    {
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      aiTouchedAt: input.refreshedAt,
      humanTouchedAt: input.lastActionAt,
    },
    now,
  );
}

export function getDataCardFreshness(input: DataCardFreshnessInput, now = new Date()) {
  return getCardFreshnessState(input, now);
}

export function getTopicCardFreshness(input: TopicCardFreshnessInput, now = new Date()) {
  return getCardFreshnessState(input, now);
}

export function getKnowledgeCardFreshness(input: IntelligenceCardFreshnessInput, now = new Date()) {
  return getFeedbackDrivenFreshness(input, now);
}

export function getGoalCardFreshness(input: IntelligenceCardFreshnessInput, now = new Date()) {
  return getFeedbackDrivenFreshness(input, now);
}

export function getTaskCardFreshness(input: TaskCardFreshnessInput, now = new Date()) {
  return getCardFreshnessState(
    {
      createdAt: input.createdAt,
      updatedAt: input.updatedAt,
      aiTouchedAt: input.generatedAt,
    },
    now,
  );
}
