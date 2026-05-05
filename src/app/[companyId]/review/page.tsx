'use client';

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, HardHat, Save } from "lucide-react";

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
  Badge
} from "@mantine/core";
import { PageHeader, PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardHeader, UnifiedCardBody, UnifiedCardActions } from "@/components/ui/unified-card";

export default function ReviewDashboard() {
  const params = useParams();
  const companyId = params.companyId as string;

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Load items needing review directly from API
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
            processingStatus: "CHECKED" // Return to pipeline Axiom 2
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
      // Remove from list
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
          <Skeleton h={40} w={300} radius="md" />
          <Skeleton h={20} w={600} radius="md" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Skeleton h={300} radius="lg" />
            <Skeleton h={300} radius="lg" />
          </div>
        </Stack>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <Stack gap="xl">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <PageHeader 
            title="Axiom Review Gateway" 
            description="Resolve intelligence items where the AI elected not to assign strict mathematical scoring parameters. You must supply a 1-10 boundary score for each item to return it to autonomous flow." 
          />
        </motion.div>

        {items.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Center h="50vh">
              <Stack align="center" gap="md" p={40} style={{ border: '1px dashed var(--mantine-color-dark-4)', borderRadius: '2rem', background: 'rgba(0,0,0,0.1)' }}>
                <HardHat className="w-12 h-12 text-zinc-600 mb-4" />
                <Title order={3} fw={900} lts={-0.5} c="white">No Anomalies Detected</Title>
                <Text size="sm" c="dimmed" ta="center" maw={400}>The trinity engine is successfully grading all intelligence inside the established Axioms.</Text>
              </Stack>
            </Center>
          </motion.div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '1rem' }}>
            <AnimatePresence>
              {items.map(item => (
                <ReviewEditorCard key={item.id} item={item} onSave={handleScoreUpdate} isSaving={savingId === item.id} />
              ))}
            </AnimatePresence>
          </div>
        )}
      </Stack>
    </PageShell>
  );
}

function ReviewEditorCard({ item, onSave, isSaving }: { item: any; onSave: any, isSaving: boolean }) {
  const [c, setC] = useState<number | string>(1);
  const [i, setI] = useState<number | string>(1);
  const [ew, setEW] = useState<number | string>(1); // Ease or Weight

  const metricLabel = item._type === 'TASK' ? 'Ease' : 'Weight';

  return (
    <motion.div layout initial={{opacity:0, scale:0.95}} animate={{opacity:1, scale:1}} exit={{opacity:0, scale:0.95}}>
      <UnifiedCard style={{ borderColor: 'rgba(245, 158, 11, 0.3)' }}>
        <UnifiedCardHeader 
          title={item.title} 
          supporting={
            <Group gap="xs">
              <Badge variant="filled" color="orange" size="xs" tt="uppercase" fw={800}>Review Required</Badge>
              <Badge variant="outline" color="gray" size="xs" ff="monospace" tt="uppercase">{item._type}</Badge>
            </Group>
          }
        />
        <UnifiedCardBody>
          <Box p="md" mb="md" style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--mantine-radius-md)', border: '1px solid var(--mantine-color-dark-4)' }}>
            <Text size="sm" c="dimmed" lineClamp={4}>
              {item.body || item.description}
            </Text>
          </Box>

          <Group grow gap="xs">
             <NumberInput label="Impact" min={1} max={10} value={i} onChange={setI} size="sm" radius="md" />
             <NumberInput label="Confidence" min={1} max={10} value={c} onChange={setC} size="sm" radius="md" />
             <NumberInput label={metricLabel} min={1} max={10} value={ew} onChange={setEW} size="sm" radius="md" />
          </Group>

          <UnifiedCardActions mt="xl">
            <Button 
              fullWidth
              color="orange"
              onClick={() => onSave(item.id, item._type, Number(c), Number(i), Number(ew))} 
              disabled={isSaving}
              loading={isSaving}
              leftSection={isSaving ? <Loader size={14} color="dark" /> : <Save size={16} />}
              fw={900}
              tt="uppercase"
              lts={1}
            >
              {isSaving ? "Injecting Axiom..." : "Confirm & Return to Pipeline"}
            </Button>
          </UnifiedCardActions>
        </UnifiedCardBody>
      </UnifiedCard>
    </motion.div>
  );
}
