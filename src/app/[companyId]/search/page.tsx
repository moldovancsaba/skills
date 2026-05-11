'use client';

import { useCallback, useState } from "react";
import { useParams } from "next/navigation";
import { Badge, Button, Checkbox, Group, Loader, SimpleGrid, Stack, TextInput } from "@mantine/core";
import { IconSearch as SearchIcon, IconSparkles as Sparkles } from "@tabler/icons-react";
import { Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader, UnifiedCardSection } from "@/components/ui/unified-card";
import type { SearchEntityType, SearchResultRecord } from "@/lib/internal-search";
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
  const [counts, setCounts] = useState<Record<SearchEntityType, number>>({
    SOURCE: 0,
    TOPIC: 0,
    FLASHCARD: 0,
    GOALCARD: 0,
    TASK: 0,
    PIPELINE_JOB: 0,
    WORKFLOW_BLUEPRINT: 0,
  });
  const [answer, setAnswer] = useState<GroundedAnswer | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<SearchEntityType[]>([
    "SOURCE",
    "TOPIC",
    "FLASHCARD",
    "GOALCARD",
    "TASK",
    "PIPELINE_JOB",
    "WORKFLOW_BLUEPRINT",
  ]);

  const entityOptions: Array<{ value: SearchEntityType; label: string }> = [
    { value: "SOURCE", label: "Data" },
    { value: "TOPIC", label: "Topics" },
    { value: "FLASHCARD", label: "Knowmore" },
    { value: "GOALCARD", label: "Goals" },
    { value: "TASK", label: "Tasks" },
    { value: "PIPELINE_JOB", label: "Queue" },
    { value: "WORKFLOW_BLUEPRINT", label: "Workflows" },
  ];

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const [searchResponse, answerResponse] = await Promise.all([
        fetch(`/api/search?companyId=${companyId}&q=${encodeURIComponent(query)}&entityTypes=${selectedTypes.join(",")}`),
        fetch("/api/answers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, question: query, entityTypes: selectedTypes }),
        }),
      ]);
      const searchData = await searchResponse.json();
      const answerData = await answerResponse.json();
      setResults(Array.isArray(searchData.items) ? searchData.items : []);
      setCounts(searchData.counts || {
        SOURCE: 0,
        TOPIC: 0,
        FLASHCARD: 0,
        GOALCARD: 0,
        TASK: 0,
        PIPELINE_JOB: 0,
        WORKFLOW_BLUEPRINT: 0,
      });
      setAnswer(answerData);
    } finally {
      setLoading(false);
    }
  }, [companyId, query, selectedTypes]);

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

      <Checkbox.Group
        value={selectedTypes}
        onChange={(value) => setSelectedTypes(value as SearchEntityType[])}
      >
        <Group gap="md">
          {entityOptions.map((option) => (
            <Checkbox
              key={option.value}
              value={option.value}
              label={`${option.label} (${counts[option.value] ?? 0})`}
            />
          ))}
        </Group>
      </Checkbox.Group>

      {answer ? (
        <UnifiedCard tone="knowmore">
          <UnifiedCardHeader
            title="Grounded Answer"
            supporting={
              <Group gap="xs">
                <Badge variant="light" color="knowmore">Grounded</Badge>
                <Badge variant="light" color="review">{answer.evidence.length} evidence cards</Badge>
                <Badge variant="light" color="strategy">{answer.intent}</Badge>
                <Badge variant="light" color="gray">{answer.appliedEntityTypes.length} layers</Badge>
                <Badge variant="light" color={answer.confidence === "HIGH" ? "knowmore" : answer.confidence === "MEDIUM" ? "strategy" : "review"}>
                  {answer.confidence} confidence
                </Badge>
              </Group>
            }
          />
          <UnifiedCardBody>
            <BodyText>{answer.summary}</BodyText>
            {answer.evidenceGroups.length > 0 ? (
              <Group gap="xs">
                {answer.evidenceGroups.map((group) => (
                  <Badge key={group.entityType} variant="outline" color="gray">
                    {group.label} {group.count}
                  </Badge>
                ))}
              </Group>
            ) : null}
            {answer.evidence.length > 0 ? (
              <Stack gap="xs">
                <MetaText>Cited evidence</MetaText>
                {answer.evidence.map((item) => (
                  <UnifiedCardSection key={`${item.entityType}:${item.id}`} tone="knowmore">
                    <Stack gap="xs">
                      <Group justify="space-between" align="flex-start">
                        <Stack gap={4} style={{ flex: 1 }}>
                          <Badge variant="outline" color="gray" w="fit-content">
                            {toneLabel(item.entityType)}
                          </Badge>
                          <BodyText>{item.title}</BodyText>
                        </Stack>
                        <Button component="a" href={item.href} variant="subtle" rightSection={<Sparkles size={14} />}>
                          Open
                        </Button>
                      </Group>
                      <MetaText>{item.snippet}</MetaText>
                    </Stack>
                  </UnifiedCardSection>
                ))}
              </Stack>
            ) : null}
            <Stack gap="xs">
              <MetaText>Recommended next actions</MetaText>
              {answer.nextActions.map((item) => (
                <BodyText key={item}>{item}</BodyText>
              ))}
            </Stack>
          </UnifiedCardBody>
        </UnifiedCard>
      ) : null}

      {results.length > 0 ? (
        <Group gap="xs">
          <Badge variant="light" color="review">{results.length} ranked results</Badge>
          {entityOptions.map((option) =>
            counts[option.value] > 0 ? (
              <Badge key={option.value} variant="outline" color="gray">
                {option.label} {counts[option.value]}
              </Badge>
            ) : null,
          )}
        </Group>
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
