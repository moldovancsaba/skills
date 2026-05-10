'use client';

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Button, Group, Loader, SimpleGrid, Stack, TextInput } from "@mantine/core";
import { IconSearch as SearchIcon, IconSparkles as Sparkles } from "@tabler/icons-react";
import { Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, CardTitle, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import type { SearchResultRecord } from "@/lib/internal-search";
import type { GroundedAnswer } from "@/lib/grounded-answers";

function toneLabel(entityType: SearchResultRecord["entityType"]) {
  switch (entityType) {
    case "SOURCE":
      return "Data";
    case "TOPIC":
      return "Topic";
    case "FLASHCARD":
      return "Knowmore";
    case "GOALCARD":
      return "Goal";
    case "TASK":
      return "Task";
    case "PIPELINE_JOB":
      return "Worker Queue";
    case "WORKFLOW_BLUEPRINT":
      return "Workflow";
  }
}

export default function SearchPage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResultRecord[]>([]);
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const [searchResponse, answerResponse] = await Promise.all([
        fetch(`/api/search?companyId=${companyId}&q=${encodeURIComponent(query)}`),
        fetch("/api/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, question: query }),
        }),
      ]);
      const searchData = await searchResponse.json();
      const answerData = await answerResponse.json();
      setResults(Array.isArray(searchData.items) ? searchData.items : []);
      setAnswer(answerData);
    } finally {
      setLoading(false);
    }
  }, [companyId, query]);

  return (
    <PageShell width="full">
      <PageHeader
        title="Search & Answers"
        description="Unified connected retrieval across cards, queue work, and workflow blueprints with grounded answers over company context."
      />

      <Group align="flex-end">
        <TextInput
          label="Question or search query"
          placeholder="What matters most for this account right now?"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          flex={1}
        />
        <Button leftSection={loading ? <Loader size={16} color="white" /> : <SearchIcon size={16} />} onClick={() => void runSearch()}>
          Search
        </Button>
      </Group>

      {answer ? (
        <UnifiedCard tone="knowmore">
          <UnifiedCardHeader
            title="Grounded Answer"
            supporting={
              <Group gap="xs">
                <Badge variant="light" color="knowmore">Grounded</Badge>
                <Badge variant="light" color="review">{answer.evidence.length} evidence cards</Badge>
              </Group>
            }
          />
          <UnifiedCardBody>
            <BodyText>{answer.summary}</BodyText>
            <Stack gap="xs">
              <MetaText>Recommended next actions</MetaText>
              {answer.nextActions.map((item) => (
                <BodyText key={item}>{item}</BodyText>
              ))}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>
      ) : null}

      {results.length === 0 && !loading ? (
        <Notice title="No results yet">
          Search across Data, Topics, Knowmore, Goals, Tasks, Worker Queue jobs, and Workflow blueprints from one surface.
        </Notice>
      ) : null}

      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="lg">
        {results.map((item) => (
          <UnifiedCard key={`${item.entityType}:${item.id}`} tone={item.tone}>
            <UnifiedCardHeader
              title={item.title}
              supporting={
                <Group gap="xs">
                  <Badge variant="outline" color="gray">{toneLabel(item.entityType)}</Badge>
                  {item.supportingLabel ? <Badge variant="light" color="gray">{item.supportingLabel}</Badge> : null}
                  {typeof item.iceScore === "number" ? <Badge variant="light" color="review">ICE {Math.round(item.iceScore)}</Badge> : null}
                </Group>
              }
            />
            <UnifiedCardBody>
              <BodyText>{item.snippet}</BodyText>
              <Group justify="space-between">
                <MetaText>{new Date(item.updatedAt).toLocaleString()}</MetaText>
                <Button component="a" href={item.href} variant="subtle" rightSection={<Sparkles size={14} />}>
                  Open
                </Button>
              </Group>
            </UnifiedCardBody>
          </UnifiedCard>
        ))}
      </SimpleGrid>
    </PageShell>
  );
}
