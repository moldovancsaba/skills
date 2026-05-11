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
  IconActivity as Activity,
  IconCalendarCheck as CalendarCheck,
  IconChecks as Checks,
  IconHeartbeat as Heartbeat,
  IconRun as Run,
  IconUserCheck as UserCheck,
} from "@tabler/icons-react";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { ATHLETE_ACTIVITY_TYPES, type AthleteActivityType } from "@/lib/athlete-activity";

type AssignedWork = {
  id: string;
  publicId: number | null;
  title: string;
  description?: string | null;
  scheduledDate?: string | null;
  kanbanColumn: string;
  iceScore: number;
};

type AthleteLog = {
  id: string;
  activityDate: string;
  activityType: string;
  title: string;
  notes?: string | null;
  durationMinutes?: number | null;
  intensity?: number | null;
  readiness?: number | null;
  completionState: string;
  createdAt: string;
  nbaItemId?: string | null;
  metrics?: {
    sleepHours?: number;
    soreness?: number;
    stress?: number;
    mood?: number;
    hydration?: number;
    bodyWeight?: number;
    painArea?: string;
    nutritionNote?: string;
  } | null;
};

type AthletePayload = {
  date: string;
  athlete: {
    email: string;
    name?: string | null;
  };
  assignedWork: AssignedWork[];
  logs: AthleteLog[];
  summary: {
    totalLogs: number;
    completed: number;
    totalMinutes: number;
    averageReadiness: number | null;
    averageIntensity: number | null;
    averageSleepHours: number | null;
    averageSoreness: number | null;
    painReports: number;
  };
};

const today = () => new Date().toISOString().slice(0, 10);

export default function AthletePage() {
  const params = useParams();
  const companyId = params.companyId as string;
  const [date, setDate] = useState(today());
  const [data, setData] = useState<AthletePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activityType, setActivityType] = useState<AthleteActivityType>("TRAINING");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number | "">(45);
  const [intensity, setIntensity] = useState<number | "">(6);
  const [readiness, setReadiness] = useState<number | "">(7);
  const [sleepHours, setSleepHours] = useState<number | "">(8);
  const [soreness, setSoreness] = useState<number | "">(3);
  const [stress, setStress] = useState<number | "">(3);
  const [mood, setMood] = useState<number | "">(7);
  const [hydration, setHydration] = useState<number | "">(7);
  const [bodyWeight, setBodyWeight] = useState<number | "">("");
  const [painArea, setPainArea] = useState("");
  const [nutritionNote, setNutritionNote] = useState("");

  const loadDay = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/athlete?companyId=${companyId}&date=${date}`);
      setData(await response.json());
    } finally {
      setLoading(false);
    }
  }, [companyId, date]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadDay();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDay]);

  const resetForm = () => {
    setTitle("");
    setNotes("");
    setDurationMinutes(45);
    setIntensity(6);
    setReadiness(7);
    setSleepHours(8);
    setSoreness(3);
    setStress(3);
    setMood(7);
    setHydration(7);
    setBodyWeight("");
    setPainArea("");
    setNutritionNote("");
    setActivityType("TRAINING");
  };

  const recordActivity = useCallback(async (options?: { work?: AssignedWork; completed?: boolean }) => {
    const work = options?.work;
    const resolvedTitle = work?.title || title.trim();
    if (!resolvedTitle) return;

    setSaving(true);
    try {
      await fetch("/api/athlete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          activityDate: date,
          activityType: work ? "TRAINING" : activityType,
          title: resolvedTitle,
          notes: work ? notes || "Coach-assigned work completed." : notes,
          durationMinutes,
          intensity,
          readiness,
          metrics: {
            sleepHours,
            soreness,
            stress,
            mood,
            hydration,
            bodyWeight,
            painArea,
            nutritionNote,
          },
          nbaItemId: work?.id,
          completionState: options?.completed ? "COMPLETED" : "RECORDED",
        }),
      });
      resetForm();
      await loadDay();
    } finally {
      setSaving(false);
    }
  }, [activityType, bodyWeight, companyId, date, durationMinutes, hydration, intensity, loadDay, mood, notes, nutritionNote, painArea, readiness, sleepHours, soreness, stress, title]);

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
    totalLogs: 0,
    completed: 0,
    totalMinutes: 0,
    averageReadiness: null,
    averageIntensity: null,
    averageSleepHours: null,
    averageSoreness: null,
    painReports: 0,
  };
  const assignedWork = data?.assignedWork || [];
  const logs = data?.logs || [];

  return (
    <PageShell width="full">
      <PageHeader
        title="Athlete App"
        description="Daily athlete workspace for coach-assigned work, training logs, wellness notes, and completion records."
        actions={
          <TextInput
            type="date"
            value={date}
            onChange={(event) => setDate(event.currentTarget.value)}
          />
        }
      />

      <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
        <MetricCard icon={CalendarCheck} color="checklist" label="Coach Set" value={assignedWork.length} detail="Open assigned items" />
        <MetricCard icon={Checks} color="knowmore" label="Completed" value={summary.completed} detail={`${summary.totalLogs} records today`} />
        <MetricCard icon={Activity} color="tactical" label="Minutes" value={summary.totalMinutes} detail="Recorded training time" />
        <MetricCard icon={Heartbeat} color="review" label="Readiness" value={summary.averageReadiness ?? "—"} detail={`Sleep ${summary.averageSleepHours ?? "—"}h · soreness ${summary.averageSoreness ?? "—"}`} />
      </SimpleGrid>

      <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
        <UnifiedCard tone="checklist">
          <UnifiedCardHeader title="Coach Assigned Today" supporting={<Badge variant="light" color="checklist">{assignedWork.length} items</Badge>} />
          <UnifiedCardBody>
            {assignedWork.length === 0 ? (
              <Notice title="No assigned work">
                Nothing is currently set for this athlete day. Record independent training or wellness notes below.
              </Notice>
            ) : (
              <Stack gap="md">
                {assignedWork.map((work) => (
                  <Stack key={work.id} gap="xs">
                    <Group justify="space-between" align="flex-start">
                      <Stack gap={2} style={{ flex: 1 }}>
                        <Group gap="xs">
                          <Badge variant="outline" color="gray">#{work.publicId ?? "—"}</Badge>
                          <Badge variant="light" color="checklist">{work.kanbanColumn}</Badge>
                          <Badge variant="light" color="review">ICE {Math.round(work.iceScore)}</Badge>
                        </Group>
                        <BodyText>{work.title}</BodyText>
                        {work.description ? <MetaText lineClamp={2}>{work.description}</MetaText> : null}
                      </Stack>
                      <Button
                        size="xs"
                        color="checklist"
                        leftSection={<UserCheck size={14} />}
                        loading={saving}
                        onClick={() => void recordActivity({ work, completed: true })}
                      >
                        Complete
                      </Button>
                    </Group>
                  </Stack>
                ))}
              </Stack>
            )}
          </UnifiedCardBody>
        </UnifiedCard>

        <UnifiedCard tone="tactical">
          <UnifiedCardHeader title="Record Activity" supporting={<Badge variant="light" color="tactical">{date}</Badge>} />
          <UnifiedCardBody>
            <SegmentedControl
              value={activityType}
              data={ATHLETE_ACTIVITY_TYPES.map((item) => ({ value: item.value, label: item.label }))}
              onChange={(value) => setActivityType(value as AthleteActivityType)}
            />
            <TextInput
              label="What did you do?"
              placeholder="Strength session, recovery walk, nutrition note..."
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <NumberInput label="Minutes" min={1} max={1440} value={durationMinutes} onChange={(value) => setDurationMinutes(typeof value === "number" ? value : "")} />
              <NumberInput label="Intensity" min={1} max={10} value={intensity} onChange={(value) => setIntensity(typeof value === "number" ? value : "")} />
              <NumberInput label="Readiness" min={1} max={10} value={readiness} onChange={(value) => setReadiness(typeof value === "number" ? value : "")} />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <NumberInput label="Sleep hours" min={0} max={24} decimalScale={1} value={sleepHours} onChange={(value) => setSleepHours(typeof value === "number" ? value : "")} />
              <NumberInput label="Soreness" min={1} max={10} value={soreness} onChange={(value) => setSoreness(typeof value === "number" ? value : "")} />
              <NumberInput label="Stress" min={1} max={10} value={stress} onChange={(value) => setStress(typeof value === "number" ? value : "")} />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
              <NumberInput label="Mood" min={1} max={10} value={mood} onChange={(value) => setMood(typeof value === "number" ? value : "")} />
              <NumberInput label="Hydration" min={1} max={10} value={hydration} onChange={(value) => setHydration(typeof value === "number" ? value : "")} />
              <NumberInput label="Body weight" min={20} max={400} decimalScale={1} value={bodyWeight} onChange={(value) => setBodyWeight(typeof value === "number" ? value : "")} />
            </SimpleGrid>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
              <TextInput
                label="Pain area"
                placeholder="None, left knee, shoulder..."
                value={painArea}
                onChange={(event) => setPainArea(event.currentTarget.value)}
              />
              <TextInput
                label="Nutrition note"
                placeholder="Meals, supplements, hydration..."
                value={nutritionNote}
                onChange={(event) => setNutritionNote(event.currentTarget.value)}
              />
            </SimpleGrid>
            <Textarea
              label="Notes"
              placeholder="Pain, energy, RPE, sets/reps, food, sleep, coach feedback..."
              minRows={4}
              autosize
              value={notes}
              onChange={(event) => setNotes(event.currentTarget.value)}
            />
            <Group gap="sm">
              <Button leftSection={<Run size={16} />} loading={saving} onClick={() => void recordActivity()}>
                Record
              </Button>
              <Button variant="light" color="review" onClick={resetForm}>
                Clear
              </Button>
            </Group>
          </UnifiedCardBody>
        </UnifiedCard>
      </SimpleGrid>

      <UnifiedCard tone="review">
        <UnifiedCardHeader title="Daily Record" supporting={<Badge variant="light" color="review">{logs.length} entries</Badge>} />
        <UnifiedCardBody>
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Activity</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Minutes</Table.Th>
                <Table.Th>Intensity</Table.Th>
                <Table.Th>Readiness</Table.Th>
                <Table.Th>Wellness</Table.Th>
                <Table.Th>Status</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {logs.map((log) => (
                <Table.Tr key={log.id}>
                  <Table.Td>
                    <Stack gap={2}>
                      <BodyText>{log.title}</BodyText>
                      {log.notes ? <MetaText lineClamp={1}>{log.notes}</MetaText> : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>{log.activityType}</Table.Td>
                  <Table.Td>{log.durationMinutes ?? "—"}</Table.Td>
                  <Table.Td>{log.intensity ?? "—"}</Table.Td>
                  <Table.Td>{log.readiness ?? "—"}</Table.Td>
                  <Table.Td>
                    <MetaText>
                      Sleep {log.metrics?.sleepHours ?? "—"}h · sore {log.metrics?.soreness ?? "—"}
                      {log.metrics?.painArea ? ` · pain ${log.metrics.painArea}` : ""}
                    </MetaText>
                  </Table.Td>
                  <Table.Td>
                    <Badge variant="light" color={log.completionState === "COMPLETED" ? "knowmore" : "gray"}>
                      {log.completionState}
                    </Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </UnifiedCardBody>
      </UnifiedCard>
    </PageShell>
  );
}
