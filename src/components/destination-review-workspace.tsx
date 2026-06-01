'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  Code,
  Group,
  Loader,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  UnstyledButton,
} from "@mantine/core";
import {
  IconChecklist as ChecklistIcon,
  IconEye as Eye,
  IconExternalLink as ExternalLink,
  IconRefresh as Refresh,
  IconSend as Send,
} from "@tabler/icons-react";
import { EmptyState, PageShell, PipelineAccentHeader } from "@/components/ui/app-shell";
import { BodyText, MetaText, SectionTitle, Text } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";
import type { DestinationKey } from "@/lib/destination-workflow-contract";

type ReviewPacket = {
  id: string;
  packetState: string;
  submittedAt: string;
  bridgeVersion: string;
  draftId: string;
  candidateId: string;
  workflowRunId: string;
  draftPayload: Record<string, unknown>;
  evidenceSummary: Record<string, unknown>;
  diagnostics: Record<string, unknown> | Array<unknown>;
  mediaSummary?: Record<string, unknown> | null;
  metadata?: {
    source?: string;
    liveListing?: {
      id?: string;
      type?: string;
      title?: string;
      publicUrl?: string | null;
      adminUrl?: string | null;
      borough?: string | null;
      neighborhood?: string | null;
    };
  } | null;
  latestFactSnapshot?: {
    id: string;
    factsJson: Record<string, unknown>;
    extractorVersion: string;
  } | null;
  reviewDecisions?: Array<{
    decision: string;
    decisionReasonCode: string;
    reviewedAt: string;
    reviewedBy: string;
    correctedDraftPayload?: Record<string, unknown> | null;
    correctionSummary?: {
      changed?: boolean;
      changeCount?: number;
      changedPaths?: string[];
    } | null;
    correctedFactsJson?: Record<string, unknown> | null;
    factCorrectionSummary?: {
      changed?: boolean;
      changeCount?: number;
      changedPaths?: string[];
    } | null;
  }>;
  outcomeMemories?: Array<{
    eventType: string;
    reasonCode?: string | null;
    notes?: string | null;
    createdAt: string;
    payload?: Record<string, unknown> | null;
  }>;
};

type OutcomeMemory = NonNullable<ReviewPacket["outcomeMemories"]>[number];

const DECISION_OPTIONS = [
  { value: "APPROVE", label: "Approve for publish" },
  { value: "REWORK", label: "Request rework" },
  { value: "REJECT", label: "Reject permanently" },
];

const REASON_OPTIONS = [
  { value: "QUALITY_OK", label: "Quality OK" },
  { value: "SOURCE_GAP", label: "Source gap" },
  { value: "MEDIA_BLOCK", label: "Media blocked" },
  { value: "TAXONOMY_FIX", label: "Taxonomy fix needed" },
  { value: "DUPLICATE_RISK", label: "Duplicate risk" },
  { value: "REJECTED_NOT_FIT", label: "Not a fit" },
];

const PACKET_STATE_OPTIONS = [
  { value: "ALL", label: "All packet states" },
  { value: "PENDING", label: "Pending review" },
  { value: "REVIEW_REQUIRED", label: "Review required" },
  { value: "APPROVED", label: "Approved" },
  { value: "REWORK_REQUESTED", label: "Rework requested" },
  { value: "REJECTED", label: "Rejected" },
  { value: "REVIEWED", label: "Reviewed" },
];

function pretty(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function packetTitle(packet: ReviewPacket) {
  const draft = packet.draftPayload;
  const name = typeof draft?.name === "string" ? draft.name : null;
  const title = typeof draft?.title === "string" ? draft.title : null;
  return name || title || packet.draftId;
}

function packetSubtitle(packet: ReviewPacket) {
  const draft = packet.draftPayload;
  const kind = typeof draft?.category === "string" ? draft.category : typeof draft?.groupType === "string" ? draft.groupType : "Draft";
  return `${kind} · ${packet.packetState}`;
}

function liveListingLabel(packet: ReviewPacket) {
  const liveListing = packet.metadata?.liveListing;
  if (!liveListing?.id || !liveListing?.type) return null;
  const title = typeof liveListing.title === "string" && liveListing.title.trim() ? liveListing.title.trim() : liveListing.id;
  return `${liveListing.type} revision · ${title}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function latestPublishOutcome(packet: ReviewPacket | null) {
  const outcomes = packet?.outcomeMemories ?? [];
  return outcomes.find((item) => item.eventType.startsWith("publish_") || item.eventType === "completed" || item.eventType === "complete") ?? null;
}

function readPublicUrlFromOutcome(outcome: OutcomeMemory | null) {
  const payload = asRecord(outcome?.payload);
  if (typeof payload?.publicUrl === "string" && payload.publicUrl.trim()) return payload.publicUrl;
  const response = asRecord(payload?.response);
  if (typeof response?.publicUrl === "string" && response.publicUrl.trim()) return response.publicUrl;
  const publicVerification = asRecord(response?.publicVerification) ?? asRecord(payload?.publicVerification);
  if (typeof publicVerification?.publicUrl === "string" && publicVerification.publicUrl.trim()) {
    return publicVerification.publicUrl;
  }
  return null;
}

export function DestinationReviewWorkspace({
  companyId,
  destinationKey,
  embedded = false,
}: {
  companyId: string;
  destinationKey?: DestinationKey;
  embedded?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [packets, setPackets] = useState<ReviewPacket[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [packetStateFilter, setPacketStateFilter] = useState<string>("ALL");
  const [decision, setDecision] = useState<string>("APPROVE");
  const [reason, setReason] = useState<string>("QUALITY_OK");
  const [notes, setNotes] = useState("");
  const [draftEditorJson, setDraftEditorJson] = useState("{}");
  const [factsEditorJson, setFactsEditorJson] = useState("{}");
  const [submitting, setSubmitting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const selectedIdRef = useRef<string | null>(null);

  const selectPacket = useCallback((packet: ReviewPacket | null) => {
    selectedIdRef.current = packet?.id ?? null;
    setSelectedId(packet?.id ?? null);
    setDraftEditorJson(pretty(packet?.draftPayload ?? {}));
    setFactsEditorJson(pretty(packet?.latestFactSnapshot?.factsJson ?? {}));
  }, []);

  const loadPackets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ companyId });
      if (packetStateFilter !== "ALL") params.set("packetState", packetStateFilter);
      if (destinationKey) params.set("destinationKey", destinationKey);
      const response = await fetch(`/api/destination-review/packets?${params.toString()}`);
      const data = response.ok ? await response.json() : [];
      const nextPackets = Array.isArray(data) ? data : [];
      const previousSelectedId = selectedIdRef.current;
      const nextPacket =
        nextPackets.length > 0
          ? (selectedIdRef.current
              ? nextPackets.find((packet: ReviewPacket) => packet.id === selectedIdRef.current) ?? nextPackets[0]
              : nextPackets[0])
          : null;
      setPackets(nextPackets);
      setSelectedId(nextPacket?.id ?? null);
      selectedIdRef.current = nextPacket?.id ?? null;
      if (!previousSelectedId || nextPacket?.id !== previousSelectedId) {
        setDraftEditorJson(pretty(nextPacket?.draftPayload ?? {}));
        setFactsEditorJson(pretty(nextPacket?.latestFactSnapshot?.factsJson ?? {}));
      }
    } finally {
      setLoading(false);
    }
  }, [companyId, destinationKey, packetStateFilter]);

  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController();
    const loadPacketDetail = async () => {
      const destinationQuery = destinationKey ? `&destinationKey=${encodeURIComponent(destinationKey)}` : "";
      const response = await fetch(
        `/api/destination-review/packets/${selectedId}?companyId=${encodeURIComponent(companyId)}${destinationQuery}`,
        { signal: controller.signal },
      );
      if (!response.ok) return;
      const detail = (await response.json()) as ReviewPacket;
      setPackets((current) => current.map((packet) => (packet.id === detail.id ? { ...packet, ...detail } : packet)));
      if (selectedIdRef.current === detail.id) {
        setFactsEditorJson((existing) =>
          existing === "{}" || existing === pretty({}) ? pretty(detail.latestFactSnapshot?.factsJson ?? {}) : existing,
        );
      }
    };
    void loadPacketDetail();
    return () => controller.abort();
  }, [companyId, destinationKey, selectedId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadPackets();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadPackets]);

  const selectedPacket = useMemo(
    () => packets.find((packet) => packet.id === selectedId) ?? packets[0] ?? null,
    [packets, selectedId],
  );
  const latestCorrection = selectedPacket?.reviewDecisions?.[0]?.correctionSummary ?? null;
  const latestFactCorrection = selectedPacket?.reviewDecisions?.[0]?.factCorrectionSummary ?? null;
  const publishOutcome = latestPublishOutcome(selectedPacket);
  const publicUrl = readPublicUrlFromOutcome(publishOutcome);

  const submitDecision = useCallback(async () => {
    if (!selectedPacket) return;
    let correctedDraftPayload: Record<string, unknown> | undefined;
    let correctedFactsJson: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(draftEditorJson) as Record<string, unknown>;
      if (JSON.stringify(parsed) !== JSON.stringify(selectedPacket.draftPayload)) {
        correctedDraftPayload = parsed;
      }
      const parsedFacts = JSON.parse(factsEditorJson) as Record<string, unknown>;
      const baseFacts = selectedPacket.latestFactSnapshot?.factsJson ?? {};
      if (JSON.stringify(parsedFacts) !== JSON.stringify(baseFacts)) {
        correctedFactsJson = parsedFacts;
      }
    } catch {
      console.error("Draft or fact editor must contain valid JSON before submitting a decision.");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch(`/api/destination-review/packets/${selectedPacket.id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          destinationKey,
          bridgeVersion: selectedPacket.bridgeVersion,
          decision,
          decisionReasonCode: reason,
          decisionNotes: notes,
          requestedAction: decision === "REWORK" ? "REWORK" : decision === "APPROVE" ? "PUBLISH" : "STOP",
          correctedDraftPayload,
          correctedFactsJson,
        }),
      });
      if (!response.ok) {
        throw new Error("Decision submit failed");
      }
      setNotes("");
      await loadPackets();
    } catch (error) {
      console.error(error);
    } finally {
      setSubmitting(false);
    }
  }, [companyId, decision, destinationKey, draftEditorJson, factsEditorJson, loadPackets, notes, reason, selectedPacket]);

  const publishApprovedPacket = useCallback(async () => {
    if (!selectedPacket) return;
    setPublishing(true);
    try {
      const response = await fetch(`/api/destination-review/packets/${selectedPacket.id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, destinationKey }),
      });
      if (!response.ok) {
        throw new Error("Destination publish failed");
      }
      const result = await response.json().catch(() => ({})) as { publicUrl?: string | null };
      if (result.publicUrl) {
        window.open(result.publicUrl, "_blank", "noopener,noreferrer");
      }
      await loadPackets();
    } catch (error) {
      console.error(error);
    } finally {
      setPublishing(false);
    }
  }, [companyId, destinationKey, loadPackets, selectedPacket]);

  if (loading) {
    const loadingContent = (
      <Stack align="center" py="xl">
        <Loader />
      </Stack>
    );
    return embedded ? loadingContent : <PageShell width="full">{loadingContent}</PageShell>;
  }

  const content = (
    <Stack gap="xl">
      {embedded ? null : <PipelineAccentHeader activeKey="review" title="Destination Review Workspace" icon={ChecklistIcon} />}

      {packets.length === 0 ? (
        <EmptyState
          icon={ChecklistIcon}
          tone="review"
          title="No destination packets waiting"
          description="The reusable destination workflow does not currently have any review-ready packets for this company."
          primaryAction={
            <Button variant="light" color="review" leftSection={<Refresh size={16} />} onClick={() => void loadPackets()}>
              Refresh Queue
            </Button>
          }
        />
      ) : (
        <SimpleGrid cols={{ base: 1, xl: 3 }} spacing="lg">
            <UnifiedCard tone="review">
              <UnifiedCardHeader
                title="Review Queue"
                supporting={
                  <Group gap="xs">
                    <Badge color="review" variant="light">
                      {packets.length} packet{packets.length === 1 ? "" : "s"}
                    </Badge>
                    <Button variant="subtle" size="compact-sm" color="review" leftSection={<Refresh size={14} />} onClick={() => void loadPackets()}>
                      Refresh
                    </Button>
                  </Group>
                }
              />
              <UnifiedCardBody>
                <Stack gap="sm">
                  <Select
                    label="Packet state"
                    value={packetStateFilter}
                    data={PACKET_STATE_OPTIONS}
                    onChange={(value) => {
                      selectPacket(null);
                      setPacketStateFilter(value || "ALL");
                    }}
                    allowDeselect={false}
                  />
                  {packets.map((packet) => (
                    <UnstyledButton
                      key={packet.id}
                      onClick={() => selectPacket(packet)}
                      aria-pressed={selectedPacket?.id === packet.id}
                    >
                      <UnifiedCardSection tone={selectedPacket?.id === packet.id ? "review" : "neutral"}>
                        <Group justify="space-between" align="flex-start">
                          <Stack gap={2}>
                            <SectionTitle>{packetTitle(packet)}</SectionTitle>
                            <BodyText>{packetSubtitle(packet)}</BodyText>
                            {liveListingLabel(packet) ? <MetaText>{liveListingLabel(packet)}</MetaText> : null}
                            <MetaText>{new Date(packet.submittedAt).toLocaleString()}</MetaText>
                          </Stack>
                          <Badge color={packet.packetState === "APPROVED" ? "green" : packet.packetState === "REJECTED" ? "red" : "review"}>
                            {packet.packetState}
                          </Badge>
                        </Group>
                      </UnifiedCardSection>
                    </UnstyledButton>
                  ))}
                </Stack>
              </UnifiedCardBody>
            </UnifiedCard>

            <Stack gap="lg" style={{ gridColumn: "span 2" }}>
              {selectedPacket ? (
                <>
                  <UnifiedCard tone="review">
                    <UnifiedCardHeader
                      title={packetTitle(selectedPacket)}
                      supporting={
                        <Group gap="xs">
                          <Badge variant="light" color="review">{selectedPacket.packetState}</Badge>
                          <Badge variant="outline">{selectedPacket.bridgeVersion}</Badge>
                        </Group>
                      }
                    />
                    <UnifiedCardBody>
                      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
                        <Stack gap="md">
                          <UnifiedCardSection tone="review">
                            <Group justify="space-between">
                              <Text fw={600}>Draft Payload Editor</Text>
                              <Eye size={16} />
                            </Group>
                            <Textarea
                              value={draftEditorJson}
                              onChange={(event) => setDraftEditorJson(event.currentTarget.value)}
                              minRows={18}
                              autosize
                              styles={{ input: { fontFamily: "monospace" } }}
                              description="Edit the destination draft JSON before approving or reworking. The system records a correction summary for training."
                            />
                          </UnifiedCardSection>

                          <UnifiedCardSection tone="review">
                            <Text fw={600}>Evidence Summary</Text>
                            <Code block>{pretty(selectedPacket.evidenceSummary)}</Code>
                          </UnifiedCardSection>

                          <UnifiedCardSection tone="review">
                            <Text fw={600}>Workflow References</Text>
                            <Code block>{pretty({
                              workflowRunId: selectedPacket.workflowRunId,
                              candidateId: selectedPacket.candidateId,
                              draftId: selectedPacket.draftId,
                              liveListing: selectedPacket.metadata?.liveListing ?? null,
                            })}</Code>
                          </UnifiedCardSection>
                        </Stack>

                        <Stack gap="md">
                          <UnifiedCardSection tone="review">
                            <Text fw={600}>Diagnostics</Text>
                            <Code block>{pretty(selectedPacket.diagnostics)}</Code>
                          </UnifiedCardSection>

                          <UnifiedCardSection tone="review">
                            <Text fw={600}>Facts Snapshot Editor</Text>
                            <Textarea
                              value={factsEditorJson}
                              onChange={(event) => setFactsEditorJson(event.currentTarget.value)}
                              minRows={14}
                              autosize
                              styles={{ input: { fontFamily: "monospace" } }}
                              description="Correct extracted facts here when the source interpretation was wrong or incomplete."
                            />
                          </UnifiedCardSection>

                          <UnifiedCardSection tone="review">
                            <Text fw={600}>Media Summary</Text>
                            <Code block>{pretty(selectedPacket.mediaSummary ?? {})}</Code>
                          </UnifiedCardSection>

                          <UnifiedCardSection tone="review">
                            <Text fw={600}>Latest Decision</Text>
                            <Code
                              block
                            >{pretty(selectedPacket.reviewDecisions?.[0] ?? { status: "No decisions yet" })}</Code>
                          </UnifiedCardSection>

                          <UnifiedCardSection tone="review">
                            <Text fw={600}>Latest Correction Summary</Text>
                            <Code
                              block
                            >{pretty(latestCorrection ?? { status: "No correction captured yet" })}</Code>
                          </UnifiedCardSection>

                          <UnifiedCardSection tone="review">
                            <Text fw={600}>Latest Fact Correction Summary</Text>
                            <Code
                              block
                            >{pretty(latestFactCorrection ?? { status: "No fact correction captured yet" })}</Code>
                          </UnifiedCardSection>
                        </Stack>
                      </SimpleGrid>
                    </UnifiedCardBody>
                  </UnifiedCard>

                  <UnifiedCard tone="strategy">
                    <UnifiedCardHeader title="Decision Console" />
                    <UnifiedCardBody>
                      <Stack gap="md">
                        <UnifiedCardSection tone={publishOutcome?.eventType === "publish_completed" ? "checklist" : publishOutcome ? "review" : "neutral"}>
                          <Group justify="space-between" align="flex-start">
                            <Stack gap={4}>
                              <Text fw={600}>Miniapp visibility</Text>
                              <BodyText>
                                {publishOutcome
                                  ? `${publishOutcome.eventType}${publishOutcome.reasonCode ? ` · ${publishOutcome.reasonCode}` : ""}`
                                  : "Not published to the Miniapp yet."}
                              </BodyText>
                              {publishOutcome?.notes ? <MetaText>{publishOutcome.notes}</MetaText> : null}
                              {publicUrl ? <MetaText>{publicUrl}</MetaText> : null}
                            </Stack>
                            {publicUrl ? (
                              <Button
                                component="a"
                                href={publicUrl}
                                target="_blank"
                                rel="noreferrer"
                                variant="light"
                                color="checklist"
                                leftSection={<ExternalLink size={16} />}
                              >
                                Open on Miniapp
                              </Button>
                            ) : null}
                          </Group>
                        </UnifiedCardSection>
                        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                          <Select
                            label="Decision"
                            data={DECISION_OPTIONS}
                            value={decision}
                            onChange={(value) => setDecision(value || "APPROVE")}
                          />
                          <Select
                            label="Reason"
                            data={REASON_OPTIONS}
                            value={reason}
                            onChange={(value) => setReason(value || "QUALITY_OK")}
                          />
                        </SimpleGrid>
                        <Textarea
                          label="Reviewer notes"
                          minRows={4}
                          value={notes}
                          onChange={(event) => setNotes(event.currentTarget.value)}
                          description="These notes are stored in the destination review audit trail."
                        />
                        <Group justify="space-between" align="center">
                          <MetaText>
                            Packet ID: {selectedPacket.id}
                          </MetaText>
                          <Group gap="sm">
                            {selectedPacket.packetState === "APPROVED" ? (
                              <Button
                                variant="light"
                                color="checklist"
                                leftSection={<Send size={16} />}
                                loading={publishing}
                                onClick={() => void publishApprovedPacket()}
                              >
                                Publish To Miniapp
                              </Button>
                            ) : null}
                            <Button
                              color="strategy"
                              leftSection={<Send size={16} />}
                              loading={submitting}
                              onClick={() => void submitDecision()}
                            >
                              Submit Decision
                            </Button>
                          </Group>
                        </Group>
                      </Stack>
                    </UnifiedCardBody>
                  </UnifiedCard>

                  {selectedPacket.reviewDecisions?.length ? (
                    <UnifiedCard tone="neutral">
                      <UnifiedCardHeader title="Recent Review Decisions" />
                      <UnifiedCardBody>
                        <Stack gap="sm">
                          {selectedPacket.reviewDecisions.map((item, index) => (
                            <UnifiedCardSection key={`${item.reviewedAt}-${index}`} tone="neutral">
                              <Group justify="space-between" align="flex-start">
                                <Stack gap={2}>
                                  <BodyText>{item.decision}</BodyText>
                                  <MetaText>{item.decisionReasonCode}</MetaText>
                                </Stack>
                                <MetaText>{new Date(item.reviewedAt).toLocaleString()}</MetaText>
                              </Group>
                            </UnifiedCardSection>
                          ))}
                        </Stack>
                      </UnifiedCardBody>
                    </UnifiedCard>
                  ) : null}
                </>
              ) : null}
            </Stack>
        </SimpleGrid>
      )}
    </Stack>
  );

  return embedded ? content : <PageShell width="full">{content}</PageShell>;
}
