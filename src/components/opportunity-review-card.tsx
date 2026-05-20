import { Badge, Button, Group, Select, SimpleGrid, Stack, TextInput, Textarea, ThemeIcon } from "@mantine/core";
import { IconArchive as Archive, IconCheck as Check, IconMessage2 as MessageSquare, IconPencil as PencilLine, IconRefresh as RefreshCw, IconX as X, IconPin as Pin } from "@tabler/icons-react";
import { CardShareAction } from "@/components/ui/card-share-action";
import { MetaText, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardActions, UnifiedCardBody, UnifiedCardFooter, UnifiedCardFreshnessBadge, UnifiedCardHeader, UnifiedCardSection, UnifiedCardText } from "@/components/ui/unified-card";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { getTaskCardFreshness } from "@/lib/card-freshness";
import { getDisplayableHumanComment } from "@/lib/ui-utils";

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
  userAnnotation?: string | null;
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

export function OpportunityReviewCard({
  item,
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
    isMeaningfulField(item.financialBackground, duplicateBlockers) ? { label: "Financial", value: normalizeText(item.financialBackground) } : null,
    isMeaningfulField(item.fitRationale, duplicateBlockers) ? { label: "Fit", value: normalizeText(item.fitRationale) } : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));
  const hasDetails = socialLinks.length > 0 || infoRows.length > 0;
  const displayableComment = getDisplayableHumanComment(item.userAnnotation);

  return (
    <UnifiedCard
      tone="strategy"
      fullWidth
      muted={item.processingStatus === "DECLINED" || item.activityState === "ARCHIVED"}
      onClick={onOpenDetail ? () => onOpenDetail(item) : undefined}
    >
      <UnifiedCardHeader
        clampTitle={!detailMode}
        supporting={
          <Group justify="space-between" wrap="nowrap" w="100%">
            <Group gap="xs">
              <Badge color="dark">{item.processingStatus}</Badge>
              <Badge color="strategy" variant="light">Opportunitycard</Badge>
              <Badge color="ingress" variant="light">#{item.opportunityType}</Badge>
              <UnifiedCardFreshnessBadge freshness={freshness} />
            </Group>
            <Badge color={getIceBadgeColor(item.iceScore)}>ICE {Math.round(item.iceScore)}</Badge>
          </Group>
        }
        title={primaryTitle || "Opportunitycard"}
      />

      <UnifiedCardBody>
        {bodyIsUseful ? <UnifiedCardText disablePreview={detailMode} markdown>{item.body}</UnifiedCardText> : null}

        {item.hashtags.length > 0 ? (
          <Group gap={4} wrap="wrap">
            {item.hashtags.map((tag) => (
              <Badge key={tag} size="xs" variant="outline" color="gray">
                #{tag}
              </Badge>
            ))}
          </Group>
        ) : null}

        {hasDetails ? (
          <UnifiedCardSection tone="strategy">
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
                      color="strategy"
                      onClick={(event) => event.stopPropagation()}
                    >
                      {link.label}: {toDisplayUrl(link.value)}
                    </Badge>
                  ))}
                </Group>
              ) : null}

              {infoRows.length > 0 ? (
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm" verticalSpacing="sm">
                  {infoRows.map((row) => (
                    <Stack key={row.label} gap={2}>
                      <MetaText>{row.label}</MetaText>
                      <Text size="sm">{row.value}</Text>
                    </Stack>
                  ))}
                </SimpleGrid>
              ) : null}
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

        <UnifiedCardActions>
          <Button
            size="xs"
            variant="light"
            color="strategy"
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
                        ? "strategy"
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
              color="strategy"
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
        </Stack>
      </UnifiedCardFooter>
    </UnifiedCard>
  );
}
