'use client';
import { Text } from "@/components/ui/typography";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DragDropContext, Draggable, Droppable, type DropResult, } from "@hello-pangea/dnd";
import {
  Badge, Box, Button, Center, Divider, Group, Loader, SimpleGrid, Stack, ThemeIcon, rem } from "@mantine/core";
import {
  IconAlertTriangle as AlertTriangle,
  IconArrowBackUp as ResetIcon,
  IconBolt as Bolt,
  IconBrain as Brain,
  IconClock as Clock,
  IconHelmet as HardHat,
  IconHistory as History,
  IconLayersIntersect as Layers,
  IconListCheck as ListCheck,
  IconRefresh as RefreshIcon,
} from "@tabler/icons-react";
import { useParams } from "next/navigation";
import { Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import type { PipelineJobRecord, PipelineQueueColumn } from "@/lib/pipeline-queue";
import { getSemanticSurfaceStyle } from "@/lib/semantic-theme";
import { useI18n, type UiLanguage } from "@/lib/ui-i18n";
import { getPipelineJobLabel, getPipelineSourceSignalLabel, translatePipelineReason } from "@/lib/pipeline-ui-i18n";

const COLUMN_TRANSLATIONS: Record<UiLanguage, Array<{
  key: PipelineQueueColumn;
  label: string;
  description: string;
  tone: "checklist" | "tactical" | "strategy" | "review";
}>> = {
  en: [
    { key: "NOW", label: "Now", description: "Immediate worker focus", tone: "checklist" },
    { key: "SOON", label: "Soon", description: "Next batch of repetitive work", tone: "tactical" },
    { key: "LATER", label: "Later", description: "AI backlog and periodic work", tone: "strategy" },
    { key: "PARKED", label: "Parked", description: "Temporarily out of execution", tone: "review" },
  ],
  hu: [
    { key: "NOW", label: "Most", description: "Azonnali worker fókusz", tone: "checklist" },
    { key: "SOON", label: "Hamarosan", description: "Az ismétlődő munka következő köre", tone: "tactical" },
    { key: "LATER", label: "Később", description: "AI backlog és időszakos munka", tone: "strategy" },
    { key: "PARKED", label: "Parkolva", description: "Átmenetileg nincs végrehajtásban", tone: "review" },
  ],
  es: [
    { key: "NOW", label: "Ahora", description: "Foco inmediato del worker", tone: "checklist" },
    { key: "SOON", label: "Pronto", description: "Siguiente lote de trabajo repetitivo", tone: "tactical" },
    { key: "LATER", label: "Después", description: "Backlog de IA y trabajo periódico", tone: "strategy" },
    { key: "PARKED", label: "Aparcado", description: "Temporalmente fuera de ejecución", tone: "review" },
  ],
  ar: [
    { key: "NOW", label: "الآن", description: "تركيز العامل الفوري", tone: "checklist" },
    { key: "SOON", label: "قريبًا", description: "الدفعة التالية من العمل المتكرر", tone: "tactical" },
    { key: "LATER", label: "لاحقًا", description: "تراكم الذكاء الاصطناعي والعمل الدوري", tone: "strategy" },
    { key: "PARKED", label: "متوقف", description: "خارج التنفيذ مؤقتًا", tone: "review" },
  ],
  he: [
    { key: "NOW", label: "עכשיו", description: "מיקוד worker מיידי", tone: "checklist" },
    { key: "SOON", label: "בקרוב", description: "האצווה הבאה של עבודה חוזרת", tone: "tactical" },
    { key: "LATER", label: "מאוחר יותר", description: "backlog של AI ועבודה תקופתית", tone: "strategy" },
    { key: "PARKED", label: "מושהה", description: "מחוץ לביצוע זמנית", tone: "review" },
  ],
};

const PAGE_TEXT: Record<UiLanguage, Record<string, string>> = {
  en: {
    loading: "Synchronizing pipeline queue…",
    title: "AI Queue",
    description: "Shared local AI queue for repetitive jobs. Human moves win until you reset the queue back to AI-only scheduling.",
    aiOnly: "AI-only",
    humanGuided: "Human-guided",
    resetToAiOnly: "Reset to AI Only",
    queueContract: "Queue Contract",
    queueContractBody: "The local worker consumes this persisted queue directly. Manual drag-and-drop moves switch jobs into human-guided mode. Reset removes those overrides and returns scheduling to autonomous AI control.",
    failedJobs: "Failed Jobs",
    failedJobsBody: "{{count}} job(s) are currently marked failed. They remain visible in the queue until AI-only reset or a new successful run clears the error state.",
    priority: "Priority",
    noQueueRationale: "No queue rationale provided.",
    error: "Error",
    lastRun: "Last run",
    attempts: "Attempts",
    failedLoad: "Failed to load pipeline queue",
    failedReset: "Failed to reset queue",
  },
  hu: {
    loading: "Pipeline várólista szinkronizálása…",
    title: "AI várólista",
    description: "A megosztott helyi AI várólista az ismétlődő munkákhoz. A kézi mozgatás addig elsőbbséget élvez, amíg vissza nem állítod a sort tisztán AI-vezéreltre.",
    aiOnly: "Csak AI",
    humanGuided: "Ember által irányított",
    resetToAiOnly: "Visszaállítás csak AI módra",
    queueContract: "Várólista-szerződés",
    queueContractBody: "A helyi worker közvetlenül ezt a tartósított várólistát fogyasztja. A kézi drag-and-drop ember-irányított módba váltja a feladatokat. A visszaállítás eltávolítja ezeket a felülbírálásokat, és az ütemezést visszaadja az autonóm AI-nak.",
    failedJobs: "Sikertelen feladatok",
    failedJobsBody: "{{count}} feladat jelenleg sikertelenként van jelölve. Látható marad a sorban, amíg egy AI-only reset vagy egy új sikeres futás nem törli a hibát.",
    priority: "Prioritás",
    noQueueRationale: "Nincs tárolt várólista-indoklás.",
    error: "Hiba",
    lastRun: "Utolsó futás",
    attempts: "Próbálkozások",
    failedLoad: "A pipeline várólista betöltése nem sikerült",
    failedReset: "A várólista visszaállítása nem sikerült",
  },
  es: {
    loading: "Sincronizando cola del pipeline…",
    title: "Cola de IA",
    description: "Cola local de IA compartida para trabajos repetitivos. Los movimientos humanos mandan hasta que restablezcas la cola a planificación solo por IA.",
    aiOnly: "Solo IA",
    humanGuided: "Guiado por humanos",
    resetToAiOnly: "Restablecer a solo IA",
    queueContract: "Contrato de cola",
    queueContractBody: "El worker local consume directamente esta cola persistida. Los movimientos manuales por arrastrar y soltar cambian los trabajos a modo guiado por humanos. Restablecer elimina esas anulaciones y devuelve la planificación al control autónomo de la IA.",
    failedJobs: "Trabajos fallidos",
    failedJobsBody: "Actualmente hay {{count}} trabajo(s) marcados como fallidos. Siguen visibles en la cola hasta que un restablecimiento solo IA o una nueva ejecución exitosa limpie el error.",
    priority: "Prioridad",
    noQueueRationale: "No hay justificación de cola guardada.",
    error: "Error",
    lastRun: "Última ejecución",
    attempts: "Intentos",
    failedLoad: "No se pudo cargar la cola del pipeline",
    failedReset: "No se pudo restablecer la cola",
  },
  ar: {
    loading: "جارٍ مزامنة طابور pipeline…",
    title: "طابور الذكاء الاصطناعي",
    description: "طابور محلي مشترك للذكاء الاصطناعي للأعمال المتكررة. تبقى التحركات اليدوية صاحبة الأولوية حتى تعيد الطابور إلى جدولة تعتمد على الذكاء الاصطناعي فقط.",
    aiOnly: "ذكاء اصطناعي فقط",
    humanGuided: "موجّه بشريًا",
    resetToAiOnly: "إعادة الضبط إلى ذكاء اصطناعي فقط",
    queueContract: "عقد الطابور",
    queueContractBody: "يستهلك العامل المحلي هذا الطابور المحفوظ مباشرة. يحوّل السحب والإفلات اليدوي الأعمال إلى وضع موجّه بشريًا. تزيل إعادة الضبط هذه التجاوزات وتعيد الجدولة إلى التحكم الذاتي للذكاء الاصطناعي.",
    failedJobs: "وظائف فاشلة",
    failedJobsBody: "هناك {{count}} وظيفة موسومة حاليًا كفاشلة. تبقى مرئية في الطابور حتى تؤدي إعادة ضبط الذكاء الاصطناعي فقط أو تشغيل ناجح جديد إلى مسح حالة الخطأ.",
    priority: "الأولوية",
    noQueueRationale: "لا يوجد مبرر طابور محفوظ.",
    error: "خطأ",
    lastRun: "آخر تشغيل",
    attempts: "المحاولات",
    failedLoad: "فشل تحميل طابور pipeline",
    failedReset: "فشلت إعادة ضبط الطابور",
  },
  he: {
    loading: "מסנכרן את תור ה-pipeline…",
    title: "תור AI",
    description: "תור AI מקומי משותף לעבודות חוזרות. מהלכים ידניים גוברים עד שמאפסים את התור בחזרה לתזמון AI בלבד.",
    aiOnly: "AI בלבד",
    humanGuided: "מונחה אדם",
    resetToAiOnly: "איפוס ל-AI בלבד",
    queueContract: "חוזה התור",
    queueContractBody: "ה-worker המקומי צורך ישירות את התור המתמיד הזה. גרירה ושחרור ידניים מעבירים עבודות למצב מונחה אדם. איפוס מסיר את העקיפות האלה ומחזיר את התזמון לשליטת AI אוטונומית.",
    failedJobs: "עבודות שנכשלו",
    failedJobsBody: "{{count}} עבודה/ות מסומנות כרגע ככושלות. הן נשארות גלויות בתור עד שאיפוס AI בלבד או ריצה מוצלחת חדשה מנקים את מצב השגיאה.",
    priority: "עדיפות",
    noQueueRationale: "לא נשמר נימוק תור.",
    error: "שגיאה",
    lastRun: "ריצה אחרונה",
    attempts: "ניסיונות",
    failedLoad: "טעינת תור ה-pipeline נכשלה",
    failedReset: "איפוס התור נכשל",
  },
};

function getJobIcon(jobType: PipelineJobRecord["jobType"]) {
  switch (jobType) {
    case "FEEDBACK_RECONCILIATION":
      return History;
    case "CARD_RESCORING":
      return RefreshIcon;
    case "FRONTIER_RECOMPUTE":
      return ListCheck;
    case "ENSURE_FLASHCARD_MINIMUM":
    case "RESEARCH_BACKFILL":
      return Brain;
    case "ENSURE_IDEABANK_MINIMUM":
    case "ENSURE_ROADMAP_MINIMUM":
    case "ENSURE_BACKLOG_MINIMUM":
    case "ENSURE_TODO_MINIMUM":
    case "ENSURE_CHECKLIST_MINIMUM":
      return ListCheck;
    case "REFRESH_FLASHCARDS":
    case "REFRESH_TASKS":
    case "REFRESH_DATACARDS":
    case "REFRESH_GOALS":
      return HardHat;
    case "FULL_MAINTENANCE":
      return HardHat;
    case "SCORE_ALERT_REPAIR":
      return AlertTriangle;
    case "COMPANY_SYNTHESIS":
      return Brain;
    default:
      return Layers;
  }
}

function getJobLabel(language: UiLanguage, job: PipelineJobRecord) {
  if (job.jobType === "WORKFLOW_BLUEPRINT") {
    const blueprintName = (job.reason || "").split(" is active as a bounded workflow blueprint")[0]?.trim();
    if (blueprintName) {
      return blueprintName;
    }
  }
  return getPipelineJobLabel(language, job.jobType);
}

function formatDate(value: PipelineJobRecord["lastCompletedAt"] | PipelineJobRecord["lastTriedAt"]) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : parsed.toLocaleString();
}

function reorderPipelineJobs(
  jobs: PipelineJobRecord[],
  draggableId: string,
  source: { droppableId: string; index: number },
  destination: { droppableId: string; index: number },
) {
  const sourceColumn = source.droppableId as PipelineQueueColumn;
  const destinationColumn = destination.droppableId as PipelineQueueColumn;
  const sourceItems = jobs.filter((job) => job.queueColumn === sourceColumn);
  const destinationItems = sourceColumn === destinationColumn
    ? sourceItems
    : jobs.filter((job) => job.queueColumn === destinationColumn);
  const movingItem = sourceItems[source.index];
  if (!movingItem || movingItem.id !== draggableId) {
    return null;
  }

  const nextSource = [...sourceItems];
  nextSource.splice(source.index, 1);

  const nextDestination = sourceColumn === destinationColumn ? nextSource : [...destinationItems];
  nextDestination.splice(destination.index, 0, {
    ...movingItem,
    queueColumn: destinationColumn,
    controlMode: "HUMAN_GUIDED",
  });

  const manualize = (items: PipelineJobRecord[]) =>
    items.map((item, index) => ({
      ...item,
      queueColumn: destinationColumn,
      controlMode: "HUMAN_GUIDED" as const,
      manualSortOrder: index - items.length,
    }));

  const sourceManualized = sourceColumn === destinationColumn
    ? []
    : nextSource.map((item, index) => ({
        ...item,
        queueColumn: sourceColumn,
        controlMode: "HUMAN_GUIDED" as const,
        manualSortOrder: index - nextSource.length,
      }));
  const destinationManualized = nextDestination.map((item, index) => ({
    ...item,
    queueColumn: destinationColumn,
    controlMode: "HUMAN_GUIDED" as const,
    manualSortOrder: index - nextDestination.length,
  }));

  const patched = new Map<string, PipelineJobRecord>();
  for (const item of sourceManualized) patched.set(item.id, item);
  for (const item of destinationManualized) patched.set(item.id, item);

  return {
    nextJobs: jobs.map((job) => patched.get(job.id) ?? job),
    sourceColumn,
    destinationColumn,
    sourceColumnOrderIds: sourceColumn === destinationColumn ? undefined : sourceManualized.map((job) => job.id),
    destinationColumnOrderIds: destinationManualized.map((job) => job.id),
  };
}

export default function PipelineQueuePage() {
  const { language } = useI18n();
  const pageText = PAGE_TEXT[language] ?? PAGE_TEXT.en;
  const columns = COLUMN_TRANSLATIONS[language] ?? COLUMN_TRANSLATIONS.en;
  const params = useParams();
  const companyId = params.companyId as string;
  const [jobs, setJobs] = useState<PipelineJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);

  const loadJobs = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/pipeline-jobs?companyId=${companyId}`);
      if (!response.ok) throw new Error(pageText.failedLoad);
      setJobs(await response.json());
    } finally {
      setLoading(false);
    }
  }, [companyId, pageText.failedLoad]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadJobs();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadJobs]);

  const handleResetAiOnly = useCallback(async () => {
    setIsResetting(true);
    try {
      const response = await fetch("/api/pipeline-jobs", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "RESET_AI_ONLY",
          companyId,
        }),
      });
      if (!response.ok) throw new Error(pageText.failedReset);
      setJobs(await response.json());
    } finally {
      setIsResetting(false);
    }
  }, [companyId, pageText.failedReset]);

  const handleDragEnd = useCallback(async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    const reordered = reorderPipelineJobs(jobs, draggableId, source, destination);
    if (!reordered) return;

    setJobs(reordered.nextJobs);
    const response = await fetch("/api/pipeline-jobs", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "REORDER",
        companyId,
        jobId: draggableId,
        sourceColumn: reordered.sourceColumn,
        destinationColumn: reordered.destinationColumn,
        destinationColumnOrderIds: reordered.destinationColumnOrderIds,
        sourceColumnOrderIds: reordered.sourceColumnOrderIds,
      }),
    });
    if (!response.ok) {
      await loadJobs();
      return;
    }
    setJobs(await response.json());
  }, [companyId, jobs, loadJobs]);

  const humanGuidedCount = useMemo(
    () => jobs.filter((job) => job.controlMode === "HUMAN_GUIDED").length,
    [jobs],
  );
  const failedCount = useMemo(
    () => jobs.filter((job) => job.status === "FAILED").length,
    [jobs],
  );

  if (loading) {
    return (
      <PageShell width="full">
        <Center mih="60vh">
          <Stack align="center" gap="xl">
            <Loader color="review" />
            <Text c="dimmed">{pageText.loading}</Text>
          </Stack>
        </Center>
      </PageShell>
    );
  }

  return (
    <PageShell width="full">
      <PageHeader
        title={pageText.title}
        description={pageText.description}
        actions={
          <Group gap="sm">
            <Badge color={humanGuidedCount > 0 ? "review" : "knowmore"} variant="light" size="lg">
              {humanGuidedCount > 0 ? `${humanGuidedCount} ${pageText.humanGuided}` : pageText.aiOnly}
            </Badge>
            <Button
              color="review"
              variant="light"
              leftSection={<ResetIcon size={16} />}
              loading={isResetting}
              onClick={() => void handleResetAiOnly()}
            >
              {pageText.resetToAiOnly}
            </Button>
          </Group>
        }
      />

      <Notice title={pageText.queueContract} icon={Bolt}>
        {pageText.queueContractBody}
      </Notice>

      {failedCount > 0 ? (
        <Notice title={pageText.failedJobs} icon={AlertTriangle} variant="destructive">
          {pageText.failedJobsBody.replace("{{count}}", String(failedCount))}
        </Notice>
      ) : null}

      <DragDropContext onDragEnd={(result) => void handleDragEnd(result)}>
        <SimpleGrid cols={{ base: 1, lg: 4 }} spacing="lg">
          {columns.map((column) => {
            const columnJobs = jobs.filter((job) => job.queueColumn === column.key);
            return (
              <Droppable key={column.key} droppableId={column.key}>
                {(provided, snapshot) => (
                  <Box
                    p="md"
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    style={{
                      ...getSemanticSurfaceStyle(column.tone, { elevated: false }),
                      minHeight: rem(520),
                      borderStyle: snapshot.isDraggingOver ? "dashed" : "solid",
                    }}
                  >
                    <Stack gap="md">
                      <Group justify="space-between">
                        <Box>
                          <Text size="lg">{column.label}</Text>
                          <Text size="xs" c="dimmed">{column.description}</Text>
                        </Box>
                        <Badge color={column.tone}>{columnJobs.length}</Badge>
                      </Group>

                      <Divider variant="dashed" />

                      <Stack gap="md">
                        {columnJobs.map((job, index) => {
                          const Icon = getJobIcon(job.jobType);
                          return (
                            <Draggable key={job.id} draggableId={job.id} index={index}>
                              {(dragProvided, dragSnapshot) => (
                                <Box
                                  ref={dragProvided.innerRef}
                                  {...dragProvided.draggableProps}
                                  {...dragProvided.dragHandleProps}
                                  style={{
                                    transform: dragSnapshot.isDragging ? `${dragProvided.draggableProps.style?.transform ?? ""} rotate(1deg)` : dragProvided.draggableProps.style?.transform,
                                    ...dragProvided.draggableProps.style,
                                  }}
                                >
                                  <UnifiedCard tone={column.tone}>
                                    <UnifiedCardHeader
                                      clampTitle={false}
                                      supporting={
                                        <Group justify="space-between" wrap="nowrap" style={{ width: "100%" }}>
                                          <Group gap="xs">
                                            <ThemeIcon color={column.tone}>
                                              <Icon size={15} />
                                            </ThemeIcon>
                                            <Badge size="xs" color={job.controlMode === "HUMAN_GUIDED" ? "tactical" : "dark"}>
                                              {job.controlMode === "HUMAN_GUIDED" ? pageText.humanGuided : pageText.aiOnly}
                                            </Badge>
                                          </Group>
                                          <Badge color={job.status === "FAILED" ? "review" : column.tone}>
                                            {job.status}
                                          </Badge>
                                        </Group>
                                      }
                                      title={getJobLabel(language, job)}
                                      description={`${pageText.priority} ${Math.round(job.priorityScore)}`}
                                    />
                                    <UnifiedCardBody>
                                      <Text size="sm" c="dimmed">
                                        {translatePipelineReason(language, job.reason) || pageText.noQueueRationale}
                                      </Text>
                                      <Group gap="xs" wrap="wrap">
                                        <Badge size="xs" variant="outline" color="gray">
                                          {getPipelineSourceSignalLabel(language, job.sourceSignal || "default")}
                                        </Badge>
                                        {job.lastError ? (
                                          <Badge size="xs" color="review">{pageText.error}</Badge>
                                        ) : null}
                                      </Group>
                                      <Divider variant="dashed" />
                                      <Group gap="xs" justify="space-between">
                                        <Group gap="xs">
                                          <Clock size={14} opacity={0.7} />
                                          <Text size="xs" c="dimmed">
                                            {pageText.lastRun}: {formatDate(job.lastCompletedAt)}
                                          </Text>
                                        </Group>
                                        <Text size="xs" c="dimmed">
                                          {pageText.attempts}: {job.attemptCount}
                                        </Text>
                                      </Group>
                                    </UnifiedCardBody>
                                  </UnifiedCard>
                                </Box>
                              )}
                            </Draggable>
                          );
                        })}
                        {provided.placeholder}
                      </Stack>
                    </Stack>
                  </Box>
                )}
              </Droppable>
            );
          })}
        </SimpleGrid>
      </DragDropContext>
    </PageShell>
  );
}
