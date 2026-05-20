import { useState } from "react";
import { Badge, Button, Group, Stack, TextInput, Textarea } from "@mantine/core";
import { IconArchive as Archive, IconCheck as Check, IconRefresh as RefreshCw, IconX as X, IconPin as Pin, IconEdit as Edit } from "@tabler/icons-react";
import { CardShareAction } from "@/components/ui/card-share-action";
import { MetaText, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardActions, UnifiedCardBody, UnifiedCardFreshnessBadge, UnifiedCardHeader, UnifiedCardSection, UnifiedCardText } from "@/components/ui/unified-card";
import { getIceBadgeColor } from "@/lib/ice-colors";
import { getTaskCardFreshness } from "@/lib/card-freshness";

type Opportunitycard = {
  id: string;
  publicId: number | null;
  companyName: string;
  title: string;
  body: string;
  website?: string | null;
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

  return (
    <UnifiedCard tone="strategy">
      <UnifiedCardHeader
        title={item.companyName}
        supporting={
          <Group gap="xs">
            <Badge color="strategy" variant="light">Opportunitycard</Badge>
            <Badge color="ingress" variant="light">#{item.opportunityType}</Badge>
            <Badge color="gray" variant="light">{item.kanbanColumn}</Badge>
            <UnifiedCardFreshnessBadge freshness={freshness} />
            <Group gap={4} ml="auto">
              <MetaText>ICE</MetaText>
              <Badge color={getIceBadgeColor(item.iceScore)}>{Math.round(item.iceScore)}</Badge>
            </Group>
          </Group>
        }
      />
      <UnifiedCardBody>
        <UnifiedCardText disablePreview markdown>{item.body}</UnifiedCardText>
        <Group gap={4} wrap="wrap">
          {item.hashtags.map((tag) => (
            <Badge key={tag} size="xs" variant="outline" color="gray">
              #{tag}
            </Badge>
          ))}
        </Group>
        <UnifiedCardSection tone="strategy">
          <Stack gap={4}>
            {item.website ? <Text size="sm">Website: {item.website}</Text> : null}
            {item.location ? <Text size="sm">Location: {item.location}</Text> : null}
            {item.coreOffer ? <Text size="sm">Core Offer: {item.coreOffer}</Text> : null}
            {item.fitRationale ? <Text size="sm">Fit: {item.fitRationale}</Text> : null}
            {item.userAnnotation ? <MetaText>{item.userAnnotation}</MetaText> : null}
          </Stack>
        </UnifiedCardSection>
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
          <Button size="xs" variant="subtle" color="strategy" leftSection={<Pin size={14} />} onClick={() => onAction(item.id, "PIN")}>Pin</Button>
          <Button size="xs" variant="subtle" color="knowmore" leftSection={<RefreshCw size={14} />} onClick={() => onAction(item.id, "REQUEST_REFRESH")}>Refresh</Button>
          <Button size="xs" variant="subtle" color="gray" leftSection={<Archive size={14} />} onClick={() => onAction(item.id, "ARCHIVE")}>Archive</Button>
          <Button size="xs" variant="subtle" color="gray" leftSection={<Edit size={14} />} onClick={() => setEditing((value) => !value)}>Edit</Button>
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
    </UnifiedCard>
  );
}
