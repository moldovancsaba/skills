import { useState } from "react";
import { Badge, Button, Group, SimpleGrid, Stack, TextInput, Textarea } from "@mantine/core";
import { IconArchive as Archive, IconCheck as Check, IconRefresh as RefreshCw, IconX as X, IconPin as Pin, IconEdit as Edit } from "@tabler/icons-react";
import { CardShareAction } from "@/components/ui/card-share-action";
import { MetaText, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardActions, UnifiedCardBody, UnifiedCardFooter, UnifiedCardFreshnessBadge, UnifiedCardHeader, UnifiedCardSection, UnifiedCardText } from "@/components/ui/unified-card";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { getTaskCardFreshness } from "@/lib/card-freshness";

type Opportunitycard = {
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
  userAnnotation?: string | null;
};

type Props = {
  item: Opportunitycard;
  onAction: (itemId: string, action: string, payload?: Record<string, unknown>) => void;
};

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

export function OpportunityReviewCard({ item, onAction }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    companyName: item.companyName,
    title: item.title,
    body: item.body,
    website: item.website || "",
    location: item.location || "",
    coreOffer: item.coreOffer || "",
    fitRationale: item.fitRationale || "",
  });
  const freshness = getTaskCardFreshness({
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    generatedAt: item.generatedAt || item.refreshedAt,
  });
  const titleText = normalizeText(item.title);
  const companyName = normalizeText(item.companyName);
  const primaryTitle = looksLikeUrl(companyName) && !looksLikeUrl(titleText) ? titleText : companyName || titleText;
  const secondaryTitle =
    titleText &&
    titleText !== primaryTitle &&
    !looksLikeUrl(titleText)
      ? titleText
      : null;
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

  return (
    <UnifiedCard tone="strategy" fullWidth muted={item.activityState === "ARCHIVED" || item.processingStatus === "DECLINED"}>
      <UnifiedCardHeader
        title={primaryTitle || "Opportunitycard"}
        description={secondaryTitle || undefined}
        supporting={
          <Group justify="space-between" wrap="nowrap" w="100%">
            <Group gap="xs">
              <Badge color="strategy" variant="light">Opportunitycard</Badge>
              <Badge color="ingress" variant="light">#{item.opportunityType}</Badge>
              <Badge color="gray" variant="light">{item.kanbanColumn}</Badge>
              <UnifiedCardFreshnessBadge freshness={freshness} />
            </Group>
            <Group gap={4}>
              <MetaText>ICE</MetaText>
              <Badge color={getIceBadgeColor(item.iceScore)}>{Math.round(item.iceScore)}</Badge>
            </Group>
          </Group>
        }
      />
      <UnifiedCardBody>
        {bodyIsUseful ? <UnifiedCardText disablePreview markdown>{item.body}</UnifiedCardText> : null}
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
        {item.userAnnotation ? (
          <UnifiedCardSection tone="review">
            <MetaText>{item.userAnnotation}</MetaText>
          </UnifiedCardSection>
        ) : null}
        <UnifiedCardActions>
          <Button size="xs" color="strategy" leftSection={<Check size={14} />} onClick={() => onAction(item.id, "ACCEPT")}>Accept</Button>
          <Button
            size="xs"
            variant="outline"
            color="review"
            leftSection={<X size={14} />}
            onClick={() => {
              const annotation = window.prompt("Why should this opportunitycard be declined?", item.userAnnotation || "") || "";
              onAction(item.id, "DECLINE", { declineReason: "BAD_FIT", annotation });
            }}
          >
            Decline
          </Button>
          <Button size="xs" variant="outline" color="gray" leftSection={<Edit size={14} />} onClick={() => setEditing((value) => !value)}>{editing ? "Close" : "Edit"}</Button>
          <Group ml="auto">
            <CardShareAction cardId={item.id} />
          </Group>
        </UnifiedCardActions>
        {editing ? (
          <UnifiedCardSection>
            <Stack gap="sm">
              <TextInput label="Company" value={draft.companyName} onChange={(event) => setDraft((value) => ({ ...value, companyName: event.currentTarget.value }))} />
              <TextInput label="Title" value={draft.title} onChange={(event) => setDraft((value) => ({ ...value, title: event.currentTarget.value }))} />
              <TextInput label="Website" value={draft.website} onChange={(event) => setDraft((value) => ({ ...value, website: event.currentTarget.value }))} />
              <TextInput label="Location" value={draft.location} onChange={(event) => setDraft((value) => ({ ...value, location: event.currentTarget.value }))} />
              <TextInput label="Core Offer" value={draft.coreOffer} onChange={(event) => setDraft((value) => ({ ...value, coreOffer: event.currentTarget.value }))} />
              <TextInput label="Fit Rationale" value={draft.fitRationale} onChange={(event) => setDraft((value) => ({ ...value, fitRationale: event.currentTarget.value }))} />
              <Textarea label="Body" minRows={4} value={draft.body} onChange={(event) => setDraft((value) => ({ ...value, body: event.currentTarget.value }))} />
              <Group gap="xs">
                <Button size="xs" onClick={() => { onAction(item.id, "MODIFY", draft); setEditing(false); }}>Save</Button>
                <Button size="xs" variant="subtle" color="gray" onClick={() => setEditing(false)}>Cancel</Button>
              </Group>
            </Stack>
          </UnifiedCardSection>
        ) : null}
      </UnifiedCardBody>
      <UnifiedCardFooter>
        <Stack gap="xs">
          <MetaText>Intelligence Controls</MetaText>
          <Group gap="xs">
            <Button size="compact-xs" variant="subtle" color="strategy" leftSection={<Pin size={12} />} onClick={() => onAction(item.id, "PIN")}>Pin</Button>
            <Button size="compact-xs" variant="subtle" color="knowmore" leftSection={<RefreshCw size={12} />} onClick={() => onAction(item.id, "REQUEST_REFRESH")}>Refresh</Button>
            <Button size="compact-xs" variant="subtle" color="gray" leftSection={<Archive size={12} />} onClick={() => onAction(item.id, "ARCHIVE")}>Archive</Button>
          </Group>
        </Stack>
      </UnifiedCardFooter>
    </UnifiedCard>
  );
}
