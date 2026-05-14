'use client';

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { IconHistory as History, IconDeviceFloppy as Save, IconAlertCircle as AlertCircle, IconInfoCircle as Info } from "@tabler/icons-react";

import { 
  Button, 
  Stack, 
  Skeleton, 
  Text, 
  Center, 
  NumberInput, 
  Group, 
  Box,
  Title,
  Loader,
  Badge,
  SimpleGrid,
  ThemeIcon,
  Card,
  rem
} from "@mantine/core";
import { EmptyState, PageHeader, PageShell, PipelineAccentHeader } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardHeader, UnifiedCardBody, UnifiedCardActions, UnifiedCardSection } from "@/components/ui/unified-card";
import { calculateKnowledgeIceScore, calculateTaskIceScore } from "@/lib/scoring-contract";
import { stripTechnicalMetadata } from "@/lib/ui-utils";

export default function ReviewDashboard() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [fcRes, nbaRes] = await Promise.all([
        fetch(`/api/flashcards?companyId=${companyId}`),
        fetch(`/api/checklist?companyId=${companyId}&review=true`)
      ]);
      
      const [fcData, nbaData] = await Promise.all([
        fcRes.ok ? fcRes.json() : [],
        nbaRes.ok ? nbaRes.json() : []
      ]);

      const merged = [
        ...(Array.isArray(fcData) ? fcData : []).filter(item => item.processingStatus === "REVIEW"),
        ...(Array.isArray(nbaData) ? nbaData : []).filter(item => item.processingStatus === "REVIEW")
      ].map(item => ({...item, _type: item.kind === 'TASK' ? 'TASK' : 'FLASHCARD'}));

      setItems(merged);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void (async () => {
      await fetchItems();
    })();
  }, [fetchItems]);

  const handleScoreUpdate = async (id: string, type: 'TASK'|'FLASHCARD', newC: number, newI: number, newE_W: number) => {
    setSavingId(id);
    try {
      if (type === 'TASK') {
        const ice = calculateTaskIceScore({
          confidence: newC,
          impact: newI,
          ease: newE_W,
        });
        await fetch(`/api/checklist?id=${id}`, {
          method: "PATCH",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            confidenceScore: newC,
            confidence: newC,
            impact: newI,
            ease: newE_W,
            iceScore: ice,
            processingStatus: "CHECKED" 
          })
        });
      } else {
        await fetch(`/api/flashcards?id=${id}`, {
          method: "PATCH",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            confidenceScore: newC,
            confidence: newC,
            impact: newI,
            weight: newE_W,
            iceScore: calculateKnowledgeIceScore({
              confidence: newC,
              impact: newI,
              weight: newE_W,
            }),
            processingStatus: "CHECKED" 
          })
        });
      }
      setItems(prev => prev.filter(i => i.id !== id));
    } catch(e) {
      console.error("Save failed", e);
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <PageShell width="full">
        <Stack gap="xl">
          <Skeleton h={40} w={300} />
          <Skeleton h={20} w={600} />
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
            <Skeleton h={300} />
            <Skeleton h={300} />
          </SimpleGrid>
        </Stack>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <PipelineAccentHeader 
          activeKey="review" 
          title="Review Gateway" 
          icon={History} 
        />
        {items.length === 0 ? (
          <Center h={rem(400)}>
            <EmptyState
              icon={History}
              tone="review"
              title="Structural Integrity Verified"
              description="The synthesis engine is successfully grading all intelligence inside the established Axioms. No manual corrections required."
            />
          </Center>
        ) : (
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            {items.map(item => (
              <ReviewEditorCard 
                key={item.id} 
                item={item} 
                onSave={handleScoreUpdate} 
                isSaving={savingId === item.id} 
              />
            ))}
          </SimpleGrid>
        )}
      </Stack>
    </PageShell>
  );
}

function ReviewEditorCard({ item, onSave, isSaving }: { item: any; onSave: any, isSaving: boolean }) {
  const [c, setC] = useState<number | string>(
    Math.max(1, Math.min(10, Math.round(item.confidenceScore ?? item.confidence ?? 5))),
  );
  const [i, setI] = useState<number | string>(Math.max(1, Math.min(10, item.impact ?? 1)));
  const [ew, setEW] = useState<number | string>(
    item._type === "TASK"
      ? Math.max(1, Math.min(10, item.ease ?? 1))
      : Math.max(1, Math.min(10, item.weight ?? 1)),
  ); 

  const metricLabel = item._type === 'TASK' ? 'Ease' : 'Weight';

  return (
    <div>
      <UnifiedCard tone="review">
        <UnifiedCardHeader 
          title={stripTechnicalMetadata(item.title)} 
          supporting={
            <Group gap="xs">
                <Badge color="review" size="xs">Review Required</Badge>
                <Badge variant="outline" color="dark" size="xs">{item._type}</Badge>
            </Group>
          }
        />
        <UnifiedCardBody>
          <Stack gap="lg">
            <UnifiedCardSection tone="review">
              <Text c="dimmed" lineClamp={4}>
                {stripTechnicalMetadata(item.body || item.description)}
              </Text>
            </UnifiedCardSection>

            <SimpleGrid cols={3} spacing="xs">
              <NumberInput label="Impact" min={1} max={10} value={i} onChange={setI} />
              <NumberInput label="Confidence" min={1} max={10} value={c} onChange={setC} />
              <NumberInput label={metricLabel} min={1} max={10} value={ew} onChange={setEW} />
            </SimpleGrid>

            <UnifiedCardActions>
              <Button 
                fullWidth
                color="review"
                onClick={() => onSave(item.id, item._type, Number(c), Number(i), Number(ew))} 
                disabled={isSaving}
                loading={isSaving}
                leftSection={<Save size={16} />}
              >
                Confirm & Inject Axiom
              </Button>
            </UnifiedCardActions>
          </Stack>
        </UnifiedCardBody>
      </UnifiedCard>
    </div>
  );
}
