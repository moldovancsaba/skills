'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
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
import { PageHeader, PageShell, PipelineAccentHeader } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardHeader, UnifiedCardBody, UnifiedCardActions } from "@/components/ui/unified-card";

export default function ReviewDashboard() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchItems();
  }, [companyId]);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const [fcRes, nbaRes] = await Promise.all([
        fetch(`/api/flashcards?companyId=${companyId}`),
        fetch(`/api/nba?companyId=${companyId}`)
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
  };

  const handleScoreUpdate = async (id: string, type: 'TASK'|'FLASHCARD', newC: number, newI: number, newE_W: number) => {
    setSavingId(id);
    try {
      if (type === 'TASK') {
        const ice = newI * newC * newE_W;
        await fetch(`/api/nba?id=${id}`, {
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
            <Card style={{ borderStyle: 'dashed', backgroundColor: 'transparent' }} ta="center">
              <Stack align="center" gap="xl">
                <ThemeIcon color="gray" size={64}>
                  <History size={32} />
                </ThemeIcon>
                <Stack gap="xs">
                  <Title order={3}>Structural Integrity Verified</Title>
                  <Text c="dimmed" maw={400} mx="auto">
                    The synthesis engine is successfully grading all intelligence inside the established Axioms. No manual corrections required.
                  </Text>
                </Stack>
              </Stack>
            </Card>
          </Center>
        ) : (
          <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
            <AnimatePresence mode="popLayout">
              {items.map(item => (
                <ReviewEditorCard 
                  key={item.id} 
                  item={item} 
                  onSave={handleScoreUpdate} 
                  isSaving={savingId === item.id} 
                />
              ))}
            </AnimatePresence>
          </SimpleGrid>
        )}
      </Stack>
    </PageShell>
  );
}

function ReviewEditorCard({ item, onSave, isSaving }: { item: any; onSave: any, isSaving: boolean }) {
  const [c, setC] = useState<number | string>(1);
  const [i, setI] = useState<number | string>(1);
  const [ew, setEW] = useState<number | string>(1); 

  const metricLabel = item._type === 'TASK' ? 'Ease' : 'Weight';

  return (
    <motion.div 
      layout 
      initial={{ opacity: 0, scale: 0.98 }} 
      animate={{ opacity: 1, scale: 1 }} 
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.2 }}
    >
      <UnifiedCard style={{ borderColor: 'var(--mantine-color-orange-filled)' }}>
        <UnifiedCardHeader 
          title={item.title} 
          supporting={
            <Group gap="xs">
              <Badge color="orange" size="xs">Review Required</Badge>
              <Badge variant="outline" color="gray" size="xs">{item._type}</Badge>
            </Group>
          }
        />
        <UnifiedCardBody>
          <Stack gap="lg">
            <Box p="md" style={{ background: 'light-dark(var(--mantine-color-gray-1), var(--mantine-color-dark-8))' }}>
              <Text c="dimmed" lineClamp={4}>
                {item.body || item.description}
              </Text>
            </Box>

            <SimpleGrid cols={3} spacing="xs">
              <NumberInput label="Impact" min={1} max={10} value={i} onChange={setI} />
              <NumberInput label="Confidence" min={1} max={10} value={c} onChange={setC} />
              <NumberInput label={metricLabel} min={1} max={10} value={ew} onChange={setEW} />
            </SimpleGrid>

            <UnifiedCardActions>
              <Button 
                fullWidth
                color="orange"
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
    </motion.div>
  );
}

