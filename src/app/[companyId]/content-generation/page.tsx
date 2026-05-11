'use client';

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Button, CopyButton, Group, Loader, SegmentedControl, SimpleGrid, Stack, Textarea } from "@mantine/core";
import {
  IconAd as Ad,
  IconCopy as Copy,
  IconMail as Mail,
  IconRefresh as Refresh,
  IconSparkles as Sparkles,
  IconWorldWww as Landing,
} from "@tabler/icons-react";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import type { ContentTone, GeneratedContentBundle } from "@/lib/content-generation";

type CreativeDraft = {
  id: string;
  title: string;
  subject?: string | null;
  content: string;
  type: string;
  createdAt: string;
  usageMetrics?: any;
};

const toneOptions: Array<{ value: ContentTone; label: string }> = [
  { value: "clear", label: "Clear" },
  { value: "bold", label: "Bold" },
  { value: "executive", label: "Executive" },
  { value: "friendly", label: "Friendly" },
  { value: "technical", label: "Technical" },
];

function CopyAction({ value }: { value: string }) {
  return (
    <CopyButton value={value}>
      {({ copied, copy }) => (
        <Button variant="subtle" size="xs" color={copied ? "knowmore" : "review"} leftSection={<Copy size={14} />} onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </Button>
      )}
    </CopyButton>
  );
}

function DraftCard({ draft }: { draft: CreativeDraft }) {
  return (
    <UnifiedCard tone={draft.type === "EMAIL" ? "knowmore" : draft.type === "LINKEDIN" ? "strategy" : "tactical"}>
      <UnifiedCardHeader
        title={draft.title}
        supporting={
          <Group gap="xs">
            <Badge variant="outline" color="gray">{draft.type}</Badge>
            {draft.usageMetrics?.platform ? <Badge variant="light" color="gray">{draft.usageMetrics.platform}</Badge> : null}
          </Group>
        }
        actions={<CopyAction value={draft.subject ? `${draft.subject}\n\n${draft.content}` : draft.content} />}
      />
      <UnifiedCardBody>
        {draft.subject ? <BodyText>{draft.subject}</BodyText> : null}
        <BodyText>{draft.content}</BodyText>
        <MetaText>{new Date(draft.createdAt).toLocaleString()}</MetaText>
      </UnifiedCardBody>
    </UnifiedCard>
  );
}

export default function ContentGenerationPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [tone, setTone] = useState<ContentTone>("clear");
  const [campaignBrief, setCampaignBrief] = useState("");
  const [bundle, setBundle] = useState<GeneratedContentBundle | null>(null);
  const [drafts, setDrafts] = useState<CreativeDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/content-generation?companyId=${companyId}`);
      const data = await response.json();
      setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/content-generation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, tone, campaignBrief }),
      });
      const data = await response.json();
      if (!response.ok) {
        setErrorMessage(data.error || "Generation failed");
        return;
      }
      setBundle(data.bundle);
      setDrafts(Array.isArray(data.drafts) ? [...data.drafts, ...drafts] : drafts);
    } finally {
      setGenerating(false);
    }
  }, [campaignBrief, companyId, drafts, tone]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDrafts();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDrafts]);

  if (loading) {
    return (
      <PageShell width="full">
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      </PageShell>
    );
  }

  const emailCount = bundle?.emailSubjectLines.length ?? drafts.filter((draft) => draft.type === "EMAIL").length;
  const adCount = bundle?.adCopy.length ?? drafts.filter((draft) => draft.type === "AD_COPY").length;
  const socialCount = bundle?.socialPosts.length ?? drafts.filter((draft) => draft.title.toLowerCase().includes("social")).length;

  return (
    <PageShell width="full">
      <PageHeader
        title="Content Generation"
        description="Generate evidence-aware email subject lines, platform ad copy, social posts, and landing-page sections from product and competitor context."
        actions={
          <Button leftSection={generating ? <Loader size={16} color="white" /> : <Sparkles size={16} />} onClick={() => void generate()}>
            Generate
          </Button>
        }
      />

      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={Mail} color="knowmore" label="Email Subjects" value={emailCount} detail="5 variants per run" />
        <MetricCard icon={Ad} color="tactical" label="Ad Platforms" value={adCount} detail="Facebook, Google, LinkedIn" />
        <MetricCard icon={Sparkles} color="strategy" label="Social Posts" value={socialCount} detail="Twitter, LinkedIn, Facebook" />
        <MetricCard icon={Landing} color="review" label="Saved Drafts" value={drafts.length} detail="CreativeDraft records" />
      </SimpleGrid>

      {errorMessage ? (
        <Notice title="Generation failed" variant="destructive">
          {errorMessage}
        </Notice>
      ) : null}

      <UnifiedCard tone="review">
        <UnifiedCardHeader title="Generation Controls" />
        <UnifiedCardBody>
          <SegmentedControl
            value={tone}
            data={toneOptions}
            onChange={(value) => setTone(value as ContentTone)}
          />
          <Textarea
            label="Campaign brief"
            placeholder="Example: launch a Q3 onboarding recovery campaign for enterprise prospects"
            value={campaignBrief}
            minRows={3}
            autosize
            onChange={(event) => setCampaignBrief(event.currentTarget.value)}
          />
          <Group gap="sm">
            <Button leftSection={<Sparkles size={16} />} loading={generating} onClick={() => void generate()}>
              Generate Content
            </Button>
            <Button variant="light" color="review" leftSection={<Refresh size={16} />} onClick={() => void loadDrafts()}>
              Refresh Drafts
            </Button>
          </Group>
        </UnifiedCardBody>
      </UnifiedCard>

      {bundle ? (
        <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
          <UnifiedCard tone="knowmore">
            <UnifiedCardHeader title="Email Subject Lines" supporting={<Badge variant="light" color="knowmore">5 variants</Badge>} />
            <UnifiedCardBody>
              {bundle.emailSubjectLines.map((subject) => (
                <Group key={subject} justify="space-between" wrap="nowrap">
                  <BodyText>{subject}</BodyText>
                  <CopyAction value={subject} />
                </Group>
              ))}
            </UnifiedCardBody>
          </UnifiedCard>

          <UnifiedCard tone="strategy">
            <UnifiedCardHeader title="Landing Page Copy" />
            <UnifiedCardBody>
              <BodyText>{bundle.landingPage.heroHeadline}</BodyText>
              <BodyText>{bundle.landingPage.heroSubheadline}</BodyText>
              <Stack gap={4}>
                {bundle.landingPage.benefits.map((benefit) => (
                  <MetaText key={benefit}>{benefit}</MetaText>
                ))}
              </Stack>
              <Badge variant="light" color="strategy">{bundle.landingPage.cta}</Badge>
            </UnifiedCardBody>
          </UnifiedCard>

          {bundle.adCopy.map((item) => (
            <UnifiedCard key={item.platform} tone="tactical">
              <UnifiedCardHeader title={`${item.platform} Ad`} supporting={<Badge variant="outline" color="gray">{item.characterLimit}</Badge>} actions={<CopyAction value={`${item.headline}\n\n${item.primaryText}\n\n${item.cta}`} />} />
              <UnifiedCardBody>
                <BodyText>{item.headline}</BodyText>
                <BodyText>{item.primaryText}</BodyText>
                <Badge variant="light" color="tactical">{item.cta}</Badge>
              </UnifiedCardBody>
            </UnifiedCard>
          ))}

          {bundle.socialPosts.map((item) => (
            <UnifiedCard key={item.platform} tone="review">
              <UnifiedCardHeader title={`${item.platform} Post`} supporting={<Badge variant="outline" color="gray">{item.characterLimit}</Badge>} actions={<CopyAction value={item.post} />} />
              <UnifiedCardBody>
                <BodyText>{item.post}</BodyText>
              </UnifiedCardBody>
            </UnifiedCard>
          ))}
        </SimpleGrid>
      ) : (
        <Notice title="Ready to generate">
          Pick a tone, add an optional campaign brief, and generate a full marketing copy set from the company context already in Data, Goals, Topics, and competitor records.
        </Notice>
      )}

      <UnifiedCard tone="neutral">
        <UnifiedCardHeader title="Recent Creative Drafts" supporting={<Badge variant="light" color="gray">{drafts.length} drafts</Badge>} />
        <UnifiedCardBody>
          <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
            {drafts.slice(0, 12).map((draft) => (
              <DraftCard key={draft.id} draft={draft} />
            ))}
          </SimpleGrid>
        </UnifiedCardBody>
      </UnifiedCard>
    </PageShell>
  );
}
