'use client';

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Badge,
  Button,
  Group,
  Loader,
  NumberInput,
  SegmentedControl,
  SimpleGrid,
  Stack,
  Table,
  TextInput,
  Textarea,
} from "@mantine/core";
import {
  IconAlertTriangle as AlertTriangle,
  IconMessageCircle as MessageCircle,
  IconReportAnalytics as ReportAnalytics,
  IconSparkles as Sparkles,
  IconTargetArrow as TargetArrow,
} from "@tabler/icons-react";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { VOC_CHANNELS, type VocChannel, type VocSentiment } from "@/lib/voc-signal-fusion";

type VocPayload = {
  signals: Array<{
    id: string;
    channel: string;
    sentiment: string;
    urgency: number;
    title: string;
    excerpt: string;
    customerSegment?: string | null;
    sourceLabel?: string | null;
    occurredAt: string;
  }>;
  themes: Array<{
    id: string;
    title: string;
    summary: string;
    rootCauseHypothesis: string;
    confidence: number;
    reviewState: string;
    affectedSegments: string[];
    recurrenceScore: number;
  }>;
  briefs: Array<{
    id: string;
    title: string;
    rootCause: string;
    affectedSegment?: string | null;
    recommendedWork: string;
    priorityScore: number;
    status: string;
  }>;
  summary: {
    totalSignals: number;
    negativeSignals: number;
    urgentSignals: number;
    totalThemes: number;
    reviewThemes: number;
    actionBriefs: number;
    openBriefs: number;
    averageThemeConfidence: number;
  };
  error?: string;
};

const SENTIMENT_OPTIONS: Array<{ value: VocSentiment; label: string }> = [
  { value: "NEGATIVE", label: "Negative" },
  { value: "MIXED", label: "Mixed" },
  { value: "NEUTRAL", label: "Neutral" },
  { value: "POSITIVE", label: "Positive" },
];

export default function VocPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [data, setData] = useState<VocPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [channel, setChannel] = useState<VocChannel>("SUPPORT");
  const [sentiment, setSentiment] = useState<VocSentiment>("NEGATIVE");
  const [urgency, setUrgency] = useState<number | "">(4);
  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [customerSegment, setCustomerSegment] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [lifecycleStage, setLifecycleStage] = useState("");
  const [provenanceUrl, setProvenanceUrl] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/voc?companyId=${companyId}`);
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadData]);

  const resetForm = () => {
    setTitle("");
    setExcerpt("");
    setCustomerSegment("");
    setSourceLabel("");
    setLifecycleStage("");
    setProvenanceUrl("");
    setUrgency(4);
    setSentiment("NEGATIVE");
    setChannel("SUPPORT");
  };

  const submitSignal = useCallback(async () => {
    if (!excerpt.trim()) return;
    setSaving(true);
    try {
      const response = await fetch("/api/voc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          channel,
          sentiment,
          urgency,
          title,
          excerpt,
          customerSegment,
          sourceLabel,
          lifecycleStage,
          provenanceUrl,
        }),
      });
      setData(await response.json());
      resetForm();
    } finally {
      setSaving(false);
    }
  }, [channel, companyId, customerSegment, excerpt, lifecycleStage, provenanceUrl, sentiment, sourceLabel, title, urgency]);

  if (loading) {
    return (
      <PageShell width="full">
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      </PageShell>
    );
  }

  const summary = data?.summary || {
    totalSignals: 0,
    negativeSignals: 0,
    urgentSignals: 0,
    totalThemes: 0,
    reviewThemes: 0,
    actionBriefs: 0,
    openBriefs: 0,
    averageThemeConfidence: 0,
  };

  return (
    <PageShell width="full">
      <PageHeader
        title="Customer Voice"
        description="Evidence-backed customer signal fusion for themes, root-cause hypotheses, and action briefs."
      />

      {data?.error ? <Notice title="Customer voice unavailable">{data.error}</Notice> : null}

      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={MessageCircle} color="knowmore" label="Signals" value={summary.totalSignals} detail={`${summary.negativeSignals} negative`} />
        <MetricCard icon={Sparkles} color="strategy" label="Themes" value={summary.totalThemes} detail={`Confidence ${summary.averageThemeConfidence}%`} />
        <MetricCard icon={TargetArrow} color="checklist" label="Action Briefs" value={summary.openBriefs} detail={`${summary.actionBriefs} total`} />
        <MetricCard icon={AlertTriangle} color="review" label="Urgent" value={summary.urgentSignals} detail={`${summary.reviewThemes} themes need review`} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <UnifiedCard tone="knowmore">
          <UnifiedCardHeader title="Record Customer Signal" supporting={<Badge variant="light" color="knowmore">VoC</Badge>} />
          <UnifiedCardBody>
            <SegmentedControl
              value={channel}
              data={VOC_CHANNELS.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(value) => setChannel(value as VocChannel)}
            />
            <SegmentedControl
              value={sentiment}
              data={SENTIMENT_OPTIONS}
              onChange={(value) => setSentiment(value as VocSentiment)}
            />
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput label="Title" placeholder="Pricing concern, support delay, missing export..." value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
              <NumberInput label="Urgency" min={1} max={5} value={urgency} onChange={(value) => setUrgency(typeof value === "number" ? value : "")} />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <TextInput label="Segment" placeholder="Enterprise, trial users..." value={customerSegment} onChange={(event) => setCustomerSegment(event.currentTarget.value)} />
              <TextInput label="Lifecycle" placeholder="Trial, renewal, churn..." value={lifecycleStage} onChange={(event) => setLifecycleStage(event.currentTarget.value)} />
              <TextInput label="Source" placeholder="G2, support, sales call..." value={sourceLabel} onChange={(event) => setSourceLabel(event.currentTarget.value)} />
            </SimpleGrid>
            <Textarea
              label="Customer language"
              placeholder="Paste the review, support note, survey answer, sales objection, or interview excerpt..."
              minRows={5}
              autosize
              value={excerpt}
              onChange={(event) => setExcerpt(event.currentTarget.value)}
            />
            <TextInput label="Provenance URL" placeholder="Optional source URL" value={provenanceUrl} onChange={(event) => setProvenanceUrl(event.currentTarget.value)} />
            <Group gap="sm">
              <Button leftSection={<MessageCircle size={16} />} loading={saving} onClick={() => void submitSignal()}>
                Fuse Signal
              </Button>
              <Button variant="light" color="review" onClick={resetForm}>
                Clear
              </Button>
            </Group>
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="strategy">
          <UnifiedCardHeader title="Themes" supporting={<Badge variant="light" color="strategy">{data?.themes.length || 0}</Badge>} />
          <UnifiedCardBody>
            <Stack gap="md">
              {(data?.themes || []).length === 0 ? (
                <Notice title="No themes yet">Add customer-language evidence to create the first theme and action brief.</Notice>
              ) : null}
              {(data?.themes || []).map((theme) => (
                <Stack key={theme.id} gap="xs">
                  <Group gap="xs">
                    <Badge variant="light" color={theme.reviewState === "REVIEW" ? "review" : "strategy"}>{theme.reviewState}</Badge>
                    <Badge variant="outline" color="gray">{theme.confidence}% confidence</Badge>
                    <Badge variant="outline" color="gray">{theme.recurrenceScore} signals</Badge>
                  </Group>
                  <BodyText>{theme.title}</BodyText>
                  <MetaText>{theme.summary}</MetaText>
                  <MetaText>Root cause: {theme.rootCauseHypothesis}</MetaText>
                </Stack>
              ))}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>
      </SimpleGrid>

      <UnifiedCard tone="checklist">
        <UnifiedCardHeader title="Action Briefs" supporting={<Badge variant="light" color="checklist">{data?.briefs.length || 0}</Badge>} />
        <UnifiedCardBody>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Brief</Table.Th>
                <Table.Th>Segment</Table.Th>
                <Table.Th>Priority</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(data?.briefs || []).map((brief) => (
                <Table.Tr key={brief.id}>
                  <Table.Td>
                    <Stack gap={2}>
                      <BodyText>{brief.title}</BodyText>
                      <MetaText>{brief.recommendedWork}</MetaText>
                      <MetaText>Root cause: {brief.rootCause}</MetaText>
                    </Stack>
                  </Table.Td>
                  <Table.Td>{brief.affectedSegment || "—"}</Table.Td>
                  <Table.Td>{Math.round(brief.priorityScore)}</Table.Td>
                  <Table.Td>
                    <Badge variant="light" color="gray">{brief.status}</Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </UnifiedCardBody>
      </UnifiedCard>

      <UnifiedCard tone="review">
        <UnifiedCardHeader title="Recent Signals" supporting={<Badge variant="light" color="review">{data?.signals.length || 0}</Badge>} />
        <UnifiedCardBody>
          <Stack gap="sm">
            {(data?.signals || []).map((signal) => (
              <Group key={signal.id} justify="space-between" align="flex-start">
                <Stack gap={2} style={{ flex: 1 }}>
                  <Group gap="xs">
                    <Badge variant="outline" color="gray">{signal.channel}</Badge>
                    <Badge variant="light" color={signal.sentiment === "NEGATIVE" ? "review" : "gray"}>{signal.sentiment}</Badge>
                    <Badge variant="outline" color="gray">Urgency {signal.urgency}</Badge>
                  </Group>
                  <BodyText>{signal.title}</BodyText>
                  <MetaText lineClamp={2}>{signal.excerpt}</MetaText>
                </Stack>
                <ReportAnalytics size={18} />
              </Group>
            ))}
          </Stack>
        </UnifiedCardBody>
      </UnifiedCard>
    </PageShell>
  );
}
