import Link from "next/link";
import { Badge, Button, Group, Select, Stack, TextInput, Textarea, ThemeIcon } from "@mantine/core";
import { IconArchive as Archive, IconCheck as Check, IconMessage2 as MessageSquare, IconPencil as PencilLine, IconRefresh as RefreshCw, IconX as X, IconPin as Pin } from "@tabler/icons-react";
import { CardShareAction } from "@/components/ui/card-share-action";
import { BodyText, MetaText, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardActions, UnifiedCardBody, UnifiedCardFooter, UnifiedCardFreshnessBadge, UnifiedCardHeader, UnifiedCardSection, UnifiedCardText } from "@/components/ui/unified-card";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { getTaskCardFreshness } from "@/lib/card-freshness";
import { getDisplayableHumanComment } from "@/lib/ui-utils";
import type { ModuleTone } from "@/lib/semantic-theme";
import { getOpportunityLaneMeta, getOpportunityToneColor } from "@/lib/opportunity-ui";

export type OpportunitycardActionMode = "ACCEPT" | "DECLINE" | "MODIFY" | "PIN" | "REQUEST_REFRESH" | "ARCHIVE";

export type Opportunitycard = {
  id: string;
  publicId: number | null;
  companyName: string;
  title: string;
  body: string;
  website?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  xUrl?: string | null;
  location?: string | null;
  coreOffer?: string | null;
  financialBackground?: string | null;
  fitRationale?: string | null;
  contactInfo?: Record<string, unknown> | null;
  salesGeographies?: string[];
  opportunityType: "PROSPECT" | "PARTNER" | "RESELLER";
  confidenceScore: number;
  impact: number;
  weight: number;
  iceScore: number;
  processingStatus: "DRAFT" | "CHECKED" | "VERIFIED" | "ACCEPTED" | "DECLINED" | "REVIEW";
  activityState: "ACTIVE" | "STALE" | "EXPIRED" | "ARCHIVED";
  hashtags: string[];
  kanbanColumn: "IDEABANK" | "ROADMAP" | "BACKLOG" | "TODO" | "CHECKLIST";
  createdAt?: string | null;
  updatedAt?: string | null;
  generatedAt?: string | null;
  refreshedAt?: string | null;
  lastActionAt?: string | null;
  rottenAt?: string | null;
  userAnnotation?: string | null;
  evaluationReason?: string | null;
  acceptanceCount?: number;
  declineCount?: number;
  feedbackScore?: number;
  sourceFlashcardIds?: string[];
  generatedFromIds?: string[];
  versionFamilyId?: string | null;
  duplicateClusterId?: string | null;
  refinedFromId?: string | null;
  scoreProfile?: Record<string, unknown> | null;
  evidence?: Record<string, unknown> | null;
  createdBy?: string | null;
  promptVersion?: string | null;
  promptName?: string | null;
  modelName?: string | null;
  modelVersion?: string | null;
  temperature?: number | null;
  feedback?: Array<{
    id: string;
    action: string;
    declineReason?: string | null;
    annotation?: string | null;
    actedBy?: string | null;
    createdAt: string;
  }>;
  linkedFlashcards?: Array<{
    id: string;
    publicId: number | null;
    title: string;
    departmentKey?: string | null;
    intelligenceType?: string | null;
  }>;
};

type OpportunityDraft = {
  companyName: string;
  title: string;
  body: string;
  website: string;
  location: string;
  coreOffer: string;
  fitRationale: string;
};

type Props = {
  item: Opportunitycard;
  tone?: ModuleTone;
  onOpenDetail?: (item: Opportunitycard) => void;
  detailMode?: boolean;
  isActionOpen: boolean;
  actionMode: OpportunitycardActionMode | null;
  isBusy: boolean;
  annotation: string;
  declineReason: string;
  draft: OpportunityDraft;
  onOpenAction: (item: Opportunitycard, mode: OpportunitycardActionMode) => void;
  onCloseAction: () => void;
  onAnnotationChange: (value: string) => void;
  onDeclineReasonChange: (value: string) => void;
  onDraftChange: (field: keyof OpportunityDraft, value: string) => void;
  onSubmit: (itemId: string, action: OpportunitycardActionMode) => void | Promise<void>;
};

const DECLINE_OPTIONS = [
  { value: "NOT_A_COMPANY", label: "Not a company" },
  { value: "IRRELEVANT_MARKET", label: "Irrelevant market" },
  { value: "BAD_FIT", label: "Bad fit" },
  { value: "DUPLICATE", label: "Duplicate" },
  { value: "LOW_CONFIDENCE", label: "Low confidence" },
  { value: "BAD_DATA", label: "Bad data" },
];

function normalizeText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function looksLikeUrl(value: string | null | undefined) {
  return /^(https?:\/\/|www\.)/i.test(normalizeText(value));
}

function toHref(value: string) {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

function toDisplayUrl(value: string) {
  try {
    const url = new URL(toHref(value));
    return url.host + url.pathname.replace(/\/$/, "");
  } catch {
    return value;
  }
}

function normalizeCompare(value: string | null | undefined) {
  return normalizeText(value).replace(/^https?:\/\//i, "").replace(/^www\./i, "").toLowerCase();
}

function isMeaningfulField(value: string | null | undefined, banned: string[]) {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  const comparable = normalizeCompare(normalized);
  return !banned.some((entry) => comparable === normalizeCompare(entry));
}

function isMeaningfulBody(body: string, banned: string[]) {
  const normalized = normalizeText(body);
  if (!normalized) return false;
  if (looksLikeUrl(normalized)) return false;
  if (normalized.length < 24) return false;
  return isMeaningfulField(normalized, banned);
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function stringifyStructuredValue(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return normalizeText(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function OpportunityReviewCard({
  item,
  tone = getOpportunityLaneMeta(item.kanbanColumn).tone,
  onOpenDetail,
  detailMode = false,
  isActionOpen,
  actionMode,
  isBusy,
  annotation,
  declineReason,
  draft,
  onOpenAction,
  onCloseAction,
  onAnnotationChange,
  onDeclineReasonChange,
  onDraftChange,
  onSubmit,
}: Props) {
  const stopCardClick = (event: { stopPropagation: () => void }, callback?: () => void) => {
    event.stopPropagation();
    callback?.();
  };

  const freshness = getTaskCardFreshness({
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    generatedAt: item.generatedAt || item.refreshedAt,
  });
  const titleText = normalizeText(item.title);
  const companyName = normalizeText(item.companyName);
  const primaryTitle = looksLikeUrl(companyName) && !looksLikeUrl(titleText) ? titleText : companyName || titleText;
  const duplicateBlockers = [
    companyName,
    titleText,
    item.website || "",
    item.instagramUrl || "",
    item.linkedinUrl || "",
    item.facebookUrl || "",
    item.xUrl || "",
  ];
  const socialLinks = [
    item.website ? { label: "Website", value: item.website } : null,
    item.linkedinUrl ? { label: "LinkedIn", value: item.linkedinUrl } : null,
    item.instagramUrl ? { label: "Instagram", value: item.instagramUrl } : null,
    item.facebookUrl ? { label: "Facebook", value: item.facebookUrl } : null,
    item.xUrl ? { label: "X", value: item.xUrl } : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry?.value));
  const bodyIsUseful = isMeaningfulBody(item.body, duplicateBlockers);
  const infoRows = [
    isMeaningfulField(item.location, duplicateBlockers) ? { label: "Location", value: normalizeText(item.location) } : null,
    isMeaningfulField(item.coreOffer, duplicateBlockers) ? { label: "Core Offer", value: normalizeText(item.coreOffer) } : null,
    isMeaningfulField(item.financialBackground, duplicateBlockers) ? { label: "Financial Background", value: normalizeText(item.financialBackground) } : null,
    isMeaningfulField(item.fitRationale, duplicateBlockers) ? { label: "Fit Rationale", value: normalizeText(item.fitRationale) } : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
  const scoreRows = [
    { label: "Impact", value: String(item.impact) },
    { label: "Confidence", value: String(item.confidenceScore) },
    { label: "Weight", value: String(item.weight) },
    { label: "ICE", value: String(item.iceScore) },
    { label: "Feedback Score", value: String(Number(item.feedbackScore || 0)) },
    { label: "Accepted", value: String(Number(item.acceptanceCount || 0)) },
    { label: "Declined", value: String(Number(item.declineCount || 0)) },
  ];
  const workflowRows = [
    { label: "Lane", value: item.kanbanColumn },
    { label: "Processing Status", value: item.processingStatus },
    { label: "Activity State", value: item.activityState },
    { label: "Opportunity Type", value: item.opportunityType },
    item.evaluationReason ? { label: "Evaluation Reason", value: normalizeText(item.evaluationReason) } : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
  const lineageRows = [
    item.versionFamilyId ? { label: "Version Family", value: item.versionFamilyId } : null,
    item.duplicateClusterId ? { label: "Duplicate Cluster", value: item.duplicateClusterId } : null,
    item.refinedFromId ? { label: "Refined From", value: item.refinedFromId } : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
  const metadataRows = [
    item.publicId != null ? { label: "Public ID", value: String(item.publicId) } : null,
    item.createdBy ? { label: "Created By", value: item.createdBy } : null,
    item.generatedAt ? { label: "Generated At", value: formatDateTime(item.generatedAt) || item.generatedAt } : null,
    item.refreshedAt ? { label: "Refreshed At", value: formatDateTime(item.refreshedAt) || item.refreshedAt } : null,
    item.lastActionAt ? { label: "Last Action", value: formatDateTime(item.lastActionAt) || item.lastActionAt } : null,
    item.rottenAt ? { label: "Rotten At", value: formatDateTime(item.rottenAt) || item.rottenAt } : null,
    item.promptName ? { label: "Prompt", value: item.promptName } : null,
    item.promptVersion ? { label: "Prompt Version", value: item.promptVersion } : null,
    item.modelName ? { label: "Model", value: item.modelName } : null,
    item.modelVersion ? { label: "Model Version", value: item.modelVersion } : null,
    item.temperature != null ? { label: "Temperature", value: String(item.temperature) } : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
  const structuredPayloads = [
    { label: "Contact Info", value: item.contactInfo },
    { label: "Score Profile", value: item.scoreProfile },
    { label: "Evidence", value: item.evidence },
  ].filter((entry) => entry.value && (typeof entry.value !== "object" || Object.keys(entry.value as Record<string, unknown>).length > 0));
  const displayableComment = getDisplayableHumanComment(item.userAnnotation);
  const visibleHashtags = detailMode ? item.hashtags : item.hashtags.slice(0, 5);

  return (
    <UnifiedCard
      tone={tone}
      fullWidth
      muted={item.processingStatus === "DECLINED" || item.activityState === "ARCHIVED"}
      onClick={onOpenDetail ? () => onOpenDetail(item) : undefined}
    >
      <UnifiedCardHeader
        clampTitle={!detailMode}
        supporting={
          <Group justify="space-between" align="flex-start" wrap="nowrap" w="100%">
            <Group gap="xs" wrap="wrap" style={{ flex: 1, minWidth: 0 }}>
              <Badge color="dark">{item.processingStatus}</Badge>
              <Badge color={getOpportunityToneColor(tone)} variant="light">Opportunitycard</Badge>
              <Badge color="ingress" variant="light">#{item.opportunityType}</Badge>
              <UnifiedCardFreshnessBadge freshness={freshness} />
            </Group>
            <Badge color={getIceBadgeColor(item.iceScore)} style={{ flexShrink: 0 }}>
              ICE {Math.round(item.iceScore)}
            </Badge>
          </Group>
        }
        title={primaryTitle || "Opportunitycard"}
      />

      <UnifiedCardBody>
        {bodyIsUseful ? (
          <UnifiedCardText disablePreview={detailMode} previewLength={detailMode ? 240 : 120} markdown>
            {item.body}
          </UnifiedCardText>
        ) : null}

        {visibleHashtags.length > 0 ? (
          <Group gap={4} wrap="wrap">
            {visibleHashtags.map((tag) => (
              <Badge key={tag} size="xs" variant="outline" color="gray">
                #{tag}
              </Badge>
            ))}
          </Group>
        ) : null}

        {detailMode && (socialLinks.length > 0 || infoRows.length > 0 || (item.salesGeographies?.length ?? 0) > 0) ? (
          <UnifiedCardSection tone={tone}>
            <Stack gap="sm">
              {socialLinks.length > 0 ? (
                <Group gap="xs" wrap="wrap">
                  {socialLinks.map((link) => (
                    <Badge
                      key={`${link.label}:${link.value}`}
                      component="a"
                      href={toHref(link.value)}
                      target="_blank"
                      rel="noreferrer"
                      variant="light"
                      color={getOpportunityToneColor(tone)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {link.label}: {toDisplayUrl(link.value)}
                    </Badge>
                  ))}
                </Group>
              ) : null}

              {infoRows.map((row) => (
                <Stack key={row.label} gap={2}>
                  <MetaText>{row.label}</MetaText>
                  <Text size="sm">{row.value}</Text>
                </Stack>
              ))}

              {Array.isArray(item.salesGeographies) && item.salesGeographies.length > 0 ? (
                <Stack gap={2}>
                  <MetaText>Sales Geographies</MetaText>
                  <Group gap={4} wrap="wrap">
                    {item.salesGeographies.map((entry) => (
                      <Badge key={entry} size="xs" variant="light" color={getOpportunityToneColor(tone)}>
                        {entry}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
              ) : null}
            </Stack>
          </UnifiedCardSection>
        ) : null}

        {detailMode ? (
          <UnifiedCardSection tone="review">
            <Stack gap="sm">
              <MetaText>Workflow</MetaText>
              {workflowRows.map((row) => (
                <Group key={row.label} justify="space-between" gap="md" wrap="nowrap">
                  <MetaText>{row.label}</MetaText>
                  <BodyText ta="right">{row.value}</BodyText>
                </Group>
              ))}
            </Stack>
          </UnifiedCardSection>
        ) : null}

        {detailMode ? (
          <UnifiedCardSection tone="strategy">
            <Stack gap="sm">
              <MetaText>Scoring</MetaText>
              {scoreRows.map((row) => (
                <Group key={row.label} justify="space-between" gap="md" wrap="nowrap">
                  <MetaText>{row.label}</MetaText>
                  <BodyText ta="right">{row.value}</BodyText>
                </Group>
              ))}
            </Stack>
          </UnifiedCardSection>
        ) : null}

        {detailMode && displayableComment ? (
          <UnifiedCardSection tone="review">
            <Group gap="xs" wrap="nowrap" align="flex-start">
              <ThemeIcon variant="light" color="review" size="sm">
                <MessageSquare size={14} />
              </ThemeIcon>
              <MetaText>{displayableComment}</MetaText>
            </Group>
          </UnifiedCardSection>
        ) : null}

        {detailMode && Array.isArray(item.feedback) && item.feedback.length > 0 ? (
          <UnifiedCardSection tone="knowmore">
            <Stack gap="sm">
              <MetaText>Recent Feedback</MetaText>
              {item.feedback.map((entry) => (
                <Stack key={entry.id} gap={2}>
                  <Group gap="xs" wrap="wrap">
                    <Badge size="xs" variant="light" color="gray">{entry.action}</Badge>
                    {entry.declineReason ? <Badge size="xs" variant="outline" color="review">{entry.declineReason}</Badge> : null}
                    <MetaText>{formatDateTime(entry.createdAt) || entry.createdAt}</MetaText>
                    {entry.actedBy ? <MetaText>{entry.actedBy}</MetaText> : null}
                  </Group>
                  {entry.annotation ? <BodyText>{entry.annotation}</BodyText> : null}
                </Stack>
              ))}
            </Stack>
          </UnifiedCardSection>
        ) : null}

        {detailMode && ((item.sourceFlashcardIds?.length ?? 0) > 0 || (item.generatedFromIds?.length ?? 0) > 0 || lineageRows.length > 0) ? (
          <UnifiedCardSection tone="ingress">
            <Stack gap="sm">
              <MetaText>Lineage</MetaText>
              {lineageRows.map((row) => (
                <Stack key={row.label} gap={2}>
                  <MetaText>{row.label}</MetaText>
                  <BodyText>{row.value}</BodyText>
                </Stack>
              ))}
              {item.sourceFlashcardIds?.length ? (
                <Stack gap={2}>
                  <MetaText>Source Flashcard IDs</MetaText>
                  <BodyText>{item.sourceFlashcardIds.join(", ")}</BodyText>
                </Stack>
              ) : null}
              {item.generatedFromIds?.length ? (
                <Stack gap={2}>
                  <MetaText>Generated From IDs</MetaText>
                  <BodyText>{item.generatedFromIds.join(", ")}</BodyText>
                </Stack>
              ) : null}
            </Stack>
          </UnifiedCardSection>
        ) : null}

        {detailMode && Array.isArray(item.linkedFlashcards) && item.linkedFlashcards.length > 0 ? (
          <UnifiedCardSection tone="knowmore">
            <Stack gap="sm">
              <MetaText>Supporting Knowledge</MetaText>
              <Group gap="xs" wrap="wrap">
                {item.linkedFlashcards.map((flashcard) => (
                  <Badge
                    key={flashcard.id}
                    component={Link}
                    href={`/card/${flashcard.id}`}
                    variant="light"
                    color="knowmore"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {flashcard.publicId != null ? `#${flashcard.publicId} ` : ""}{flashcard.title}
                  </Badge>
                ))}
              </Group>
            </Stack>
          </UnifiedCardSection>
        ) : null}

        {detailMode && metadataRows.length > 0 ? (
          <UnifiedCardSection tone="neutral">
            <Stack gap="sm">
              <MetaText>Generation Metadata</MetaText>
              {metadataRows.map((row) => (
                <Group key={row.label} justify="space-between" gap="md" wrap="nowrap">
                  <MetaText>{row.label}</MetaText>
                  <BodyText ta="right">{row.value}</BodyText>
                </Group>
              ))}
            </Stack>
          </UnifiedCardSection>
        ) : null}

        {detailMode && structuredPayloads.length > 0 ? (
          <UnifiedCardSection tone="neutral">
            <Stack gap="sm">
              <MetaText>Persisted Structured Fields</MetaText>
              {structuredPayloads.map((entry) => {
                const serialized = stringifyStructuredValue(entry.value);
                if (!serialized) return null;
                return (
                  <Stack key={entry.label} gap={2}>
                    <MetaText>{entry.label}</MetaText>
                    <Text size="sm" ff="monospace" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                      {serialized}
                    </Text>
                  </Stack>
                );
              })}
            </Stack>
          </UnifiedCardSection>
        ) : null}

        <UnifiedCardActions>
          <Button
            size="xs"
            variant="light"
            color={getOpportunityToneColor(tone)}
            leftSection={<Check size={14} />}
            onClick={(event) => stopCardClick(event, () => onOpenAction(item, "ACCEPT"))}
            disabled={isBusy}
          >
            Accept
          </Button>
          <Button
            size="xs"
            variant="outline"
            color="review"
            leftSection={<X size={14} />}
            onClick={(event) => stopCardClick(event, () => onOpenAction(item, "DECLINE"))}
            disabled={isBusy}
          >
            Decline
          </Button>
          <Button
            size="xs"
            variant="outline"
            color="gray"
            leftSection={<PencilLine size={14} />}
            onClick={(event) => stopCardClick(event, () => onOpenAction(item, "MODIFY"))}
            disabled={isBusy}
          >
            Edit
          </Button>
          <Group ml="auto">
            <CardShareAction cardId={item.id} />
          </Group>
        </UnifiedCardActions>

        {isActionOpen && actionMode ? (
          <UnifiedCardSection>
            <Stack gap="sm">
              <MetaText>
                {actionMode === "DECLINE"
                  ? "Decline opportunitycard"
                  : actionMode === "MODIFY"
                    ? "Modify opportunitycard"
                    : actionMode === "PIN"
                      ? "Pin opportunitycard"
                      : actionMode === "REQUEST_REFRESH"
                        ? "Request refresh"
                        : actionMode === "ARCHIVE"
                          ? "Archive opportunitycard"
                          : "Accept opportunitycard"}
              </MetaText>

              {actionMode === "MODIFY" ? (
                <Stack gap="sm">
                  <TextInput label="Company" value={draft.companyName} onChange={(event) => onDraftChange("companyName", event.currentTarget.value)} size="xs" />
                  <TextInput label="Title" value={draft.title} onChange={(event) => onDraftChange("title", event.currentTarget.value)} size="xs" />
                  <TextInput label="Website" value={draft.website} onChange={(event) => onDraftChange("website", event.currentTarget.value)} size="xs" />
                  <TextInput label="Location" value={draft.location} onChange={(event) => onDraftChange("location", event.currentTarget.value)} size="xs" />
                  <TextInput label="Core Offer" value={draft.coreOffer} onChange={(event) => onDraftChange("coreOffer", event.currentTarget.value)} size="xs" />
                  <TextInput label="Fit Rationale" value={draft.fitRationale} onChange={(event) => onDraftChange("fitRationale", event.currentTarget.value)} size="xs" />
                  <Textarea label="Body" minRows={4} value={draft.body} onChange={(event) => onDraftChange("body", event.currentTarget.value)} size="xs" />
                </Stack>
              ) : null}

              {actionMode === "DECLINE" ? (
                <Select
                  label="Decline reason"
                  data={DECLINE_OPTIONS}
                  value={declineReason}
                  onChange={(value) => onDeclineReasonChange(value || "BAD_FIT")}
                  size="xs"
                  allowDeselect={false}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : null}

              <Textarea
                label="Strategic feedback"
                value={annotation}
                onChange={(event) => onAnnotationChange(event.currentTarget.value)}
                placeholder="Add context to teach the local AI system."
                size="xs"
                autosize
                minRows={2}
              />

              <Group gap="xs">
                <Button
                  size="xs"
                  color={
                    actionMode === "DECLINE" || actionMode === "ARCHIVE"
                      ? "review"
                      : actionMode === "MODIFY" || actionMode === "PIN"
                        ? getOpportunityToneColor(tone)
                        : "ingress"
                  }
                  onClick={(event) => stopCardClick(event, () => { void onSubmit(item.id, actionMode); })}
                  disabled={isBusy || (actionMode === "MODIFY" && (!draft.companyName.trim() || !draft.body.trim()))}
                  loading={isBusy}
                >
                  Confirm
                </Button>
                <Button
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={(event) => stopCardClick(event, onCloseAction)}
                  disabled={isBusy}
                >
                  Cancel
                </Button>
              </Group>
            </Stack>
          </UnifiedCardSection>
        ) : null}
      </UnifiedCardBody>

      <UnifiedCardFooter>
        <Stack gap="xs">
          <MetaText>Intelligence Controls</MetaText>
          <Group gap="xs">
            <Button
              size="compact-xs"
              variant="subtle"
              color={getOpportunityToneColor(tone)}
              leftSection={<Pin size={12} />}
              onClick={(event) => stopCardClick(event, () => onOpenAction(item, "PIN"))}
            >
              Pin
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="knowmore"
              leftSection={<RefreshCw size={12} />}
              onClick={(event) => stopCardClick(event, () => onOpenAction(item, "REQUEST_REFRESH"))}
            >
              Refresh
            </Button>
            <Button
              size="compact-xs"
              variant="subtle"
              color="gray"
              leftSection={<Archive size={12} />}
              onClick={(event) => stopCardClick(event, () => onOpenAction(item, "ARCHIVE"))}
            >
              Archive
            </Button>
          </Group>
          {detailMode && item.refreshedAt ? (
            <MetaText>Last refresh: {new Date(item.refreshedAt).toLocaleDateString()}</MetaText>
          ) : null}
        </Stack>
      </UnifiedCardFooter>
    </UnifiedCard>
  );
}
