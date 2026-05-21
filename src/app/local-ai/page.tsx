'use client';

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Badge, Box, Group, Loader, SimpleGrid, Stack, Table, Anchor } from "@mantine/core";
import { IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconBrain as Brain, IconHeartbeat as Heartbeat, IconHierarchy as Hierarchy, IconListCheck as ListCheck, IconServer as Server } from "@tabler/icons-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MetricCard, Notice, PageHeader, PageShell } from "@/components/ui/app-shell";
import { BodyText, MetaText } from "@/components/ui/typography";
import { UnifiedCard, UnifiedCardBody, UnifiedCardHeader } from "@/components/ui/unified-card";
import { useI18n, type UiLanguage } from "@/lib/ui-i18n";
import { getPipelineJobLabel, translatePipelineReason } from "@/lib/pipeline-ui-i18n";

const STATUS_API_URL = "http://127.0.0.1:10006/api/status";
const RAW_HEALTH_URL = "http://127.0.0.1:10005/health";
const RAW_SNAPSHOT_HEALTH_URL = "http://127.0.0.1:10007/health";
const RAW_COMMAND_CENTER_URL = "http://127.0.0.1:10006";
const PAGE_TEXT: Record<UiLanguage, Record<string, string>> = {
  en: {
    title: "Local AI Mission Control",
    description: "Public operator view of the local AI runtime. Shows what the worker is doing now, which company it is touching, and the next queued work globally.",
    rawHealth: "Raw Health JSON",
    rawSnapshotHealth: "Raw Snapshot Health",
    rawCommandCenter: "Raw Command Center",
    unavailable: "Local AI status unavailable",
    unavailableBody: "Confirm the local status server is running on port 10006.",
    company: "Company",
    queue: "Queue",
    priority: "Priority",
    attempts: "Attempts",
    profile: "Profile",
    reason: "Reason",
    updated: "Updated",
    noCurrentTask: "No current queue task",
    noCurrentTaskBody: "The worker is currently idle or between queue claims.",
    noPlannerReason: "Worker is actively processing this queue job.",
    noPlannerReasonPersisted: "No planner reason persisted.",
    queueClear: "Queue clear",
    queueClearBody: "No queued jobs are waiting behind the current runtime state.",
    verificationSummary: "Last run: {{ts}} · {{passed}}/{{total}} checks passed · Trigger {{trigger}} · Status {{status}}",
    recentFailedJobs: "Recent Failed Jobs",
  },
  hu: {
    title: "Helyi AI küldetésvezérlés",
    description: "Nyilvános operátori nézet a helyi AI futásidejéről. Megmutatja, min dolgozik most a worker, melyik céget érinti, és mi a következő globális várólistás munka.",
    rawHealth: "Nyers Health JSON",
    rawSnapshotHealth: "Nyers Snapshot Health",
    rawCommandCenter: "Nyers Command Center",
    unavailable: "A helyi AI állapota nem érhető el",
    unavailableBody: "Ellenőrizd, hogy a helyi állapotszerver fut-e a 10006-os porton.",
    company: "Cég",
    queue: "Várólista",
    priority: "Prioritás",
    attempts: "Próbálkozások",
    profile: "Profil",
    reason: "Indok",
    updated: "Frissítve",
    noCurrentTask: "Nincs aktuális várólistás feladat",
    noCurrentTaskBody: "A worker jelenleg üresjáratban van vagy két sorigénylés között áll.",
    noPlannerReason: "A worker aktívan feldolgozza ezt a várólistás feladatot.",
    noPlannerReasonPersisted: "Nincs tárolt planner-indoklás.",
    queueClear: "Üres a várólista",
    queueClearBody: "A jelenlegi futási állapot mögött nem várakozik további feladat.",
    verificationSummary: "Utolsó futás: {{ts}} · {{passed}}/{{total}} ellenőrzés sikeres · Indító {{trigger}} · Állapot {{status}}",
    recentFailedJobs: "Legutóbbi sikertelen feladatok",
  },
  es: {
    title: "Control de misión de IA local",
    description: "Vista pública del operador del runtime local de IA. Muestra qué hace ahora el worker, qué empresa está tocando y el siguiente trabajo global en cola.",
    rawHealth: "JSON de salud bruto",
    rawSnapshotHealth: "Salud bruta del snapshot",
    rawCommandCenter: "Centro de mando bruto",
    unavailable: "Estado local de IA no disponible",
    unavailableBody: "Confirma que el servidor de estado local se esté ejecutando en el puerto 10006.",
    company: "Empresa",
    queue: "Cola",
    priority: "Prioridad",
    attempts: "Intentos",
    profile: "Perfil",
    reason: "Motivo",
    updated: "Actualizado",
    noCurrentTask: "No hay tarea actual en cola",
    noCurrentTaskBody: "El worker está inactivo o entre reclamaciones de cola.",
    noPlannerReason: "El worker está procesando activamente este trabajo de cola.",
    noPlannerReasonPersisted: "No hay motivo del planner persistido.",
    queueClear: "Cola vacía",
    queueClearBody: "No hay trabajos en cola esperando detrás del estado de ejecución actual.",
    verificationSummary: "Última ejecución: {{ts}} · {{passed}}/{{total}} comprobaciones superadas · Disparador {{trigger}} · Estado {{status}}",
    recentFailedJobs: "Trabajos fallidos recientes",
  },
  ar: {
    title: "مركز قيادة الذكاء الاصطناعي المحلي",
    description: "عرض عام للمشغّل لوقت تشغيل الذكاء الاصطناعي المحلي. يوضح ما الذي يفعله العامل الآن، وأي شركة يلمسها، والعمل العالمي التالي في الطابور.",
    rawHealth: "JSON الصحة الخام",
    rawSnapshotHealth: "صحة اللقطة الخام",
    rawCommandCenter: "مركز الأوامر الخام",
    unavailable: "حالة الذكاء الاصطناعي المحلي غير متاحة",
    unavailableBody: "تأكد من أن خادم الحالة المحلي يعمل على المنفذ 10006.",
    company: "الشركة",
    queue: "الطابور",
    priority: "الأولوية",
    attempts: "المحاولات",
    profile: "الملف",
    reason: "السبب",
    updated: "تم التحديث",
    noCurrentTask: "لا توجد مهمة طابور حالية",
    noCurrentTaskBody: "العامل في وضع خمول حاليًا أو بين مطالبات الطابور.",
    noPlannerReason: "يقوم العامل بمعالجة هذا العمل في الطابور بشكل نشط.",
    noPlannerReasonPersisted: "لا يوجد سبب planner محفوظ.",
    queueClear: "الطابور فارغ",
    queueClearBody: "لا توجد وظائف منتظرة خلف حالة التشغيل الحالية.",
    verificationSummary: "آخر تشغيل: {{ts}} · {{passed}}/{{total}} فحصًا ناجحًا · المشغل {{trigger}} · الحالة {{status}}",
    recentFailedJobs: "الوظائف الفاشلة الأخيرة",
  },
  he: {
    title: "בקרת משימה ל-AI מקומי",
    description: "תצוגת מפעיל ציבורית של סביבת הריצה של ה-AI המקומי. מציגה מה ה-worker עושה עכשיו, באיזו חברה הוא נוגע, ומה העבודה הגלובלית הבאה בתור.",
    rawHealth: "JSON בריאות גולמי",
    rawSnapshotHealth: "בריאות snapshot גולמית",
    rawCommandCenter: "מרכז פיקוד גולמי",
    unavailable: "סטטוס AI מקומי לא זמין",
    unavailableBody: "אשר ששרת הסטטוס המקומי רץ על פורט 10006.",
    company: "חברה",
    queue: "תור",
    priority: "עדיפות",
    attempts: "ניסיונות",
    profile: "פרופיל",
    reason: "סיבה",
    updated: "עודכן",
    noCurrentTask: "אין כרגע משימת תור",
    noCurrentTaskBody: "ה-worker כרגע במנוחה או בין תפיסות תור.",
    noPlannerReason: "ה-worker מעבד כרגע באופן פעיל את משימת התור הזו.",
    noPlannerReasonPersisted: "לא נשמר נימוק planner.",
    queueClear: "התור פנוי",
    queueClearBody: "אין עבודות שממתינות מאחורי מצב הריצה הנוכחי.",
    verificationSummary: "ריצה אחרונה: {{ts}} · {{passed}}/{{total}} בדיקות עברו · טריגר {{trigger}} · סטטוס {{status}}",
    recentFailedJobs: "עבודות שנכשלו לאחרונה",
  },
};

function formatTimestamp(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function getHumanJobLabel(jobType: unknown) {
  const key = typeof jobType === "string" ? jobType : "";
  return key.replace(/_/g, " ").toLowerCase() || "Queue task";
}

function formatJobLabel(language: UiLanguage, job: any) {
  if (!job) return "No active task";
  const jobLabel = getPipelineJobLabel(language, job.jobType) || getHumanJobLabel(job.jobType);
  const entityType = String(job.entityType || "COMPANY").toUpperCase();
  const companyName = job.companyName || job.companyId || null;
  if (entityType === "COMPANY" || !job.entityLabel || job.entityLabel === job.companyId) {
    return companyName ? `${jobLabel} for ${companyName}` : jobLabel;
  }
  return companyName ? `${jobLabel} for ${companyName}: ${job.entityLabel}` : `${jobLabel}: ${job.entityLabel}`;
}

function getExecutionProfileColor(profile: unknown) {
  switch (String(profile || "full").toLowerCase()) {
    case "minimal":
      return "review";
    case "degraded":
      return "tactical";
    default:
      return "strategy";
  }
}

function getExecutionProfileLabel(profile: unknown) {
  switch (String(profile || "full").toLowerCase()) {
    case "minimal":
      return "minimal";
    case "degraded":
      return "degraded";
    default:
      return "full";
  }
}

function getDecompositionTone(job: any) {
  if (job?.isChildSlice) return { color: "review", label: "child slice" };
  if (job?.isDecomposedParent) return { color: "tactical", label: "decomposed parent" };
  if (job?.decompositionState) return { color: "gray", label: String(job.decompositionState).toLowerCase().replace(/_/g, " ") };
  return null;
}

function chartTooltipFormatter(value: unknown) {
  if (typeof value === "number") return [Math.round(value * 10) / 10, "Value"];
  if (value == null) return ["—", "Value"];
  return [String(value), "Value"];
}

function deltaTooltipFormatter(value: unknown) {
  if (typeof value !== "number") return ["—", "Hourly change"];
  const sign = value > 0 ? "+" : "";
  return [`${sign}${Math.round(value * 10) / 10}`, "Hourly change"];
}

function formatHistoryHourLabel(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
  });
}

function formatSignedValue(value: number | null | undefined) {
  const resolved = Math.round((Number(value || 0)) * 10) / 10;
  const sign = resolved > 0 ? "+" : "";
  return `${sign}${resolved}`;
}

const CARD_TYPE_HISTORY = [
  { key: "datacards", label: "Datacards", color: "var(--mantine-color-cyan-6)" },
  { key: "flashcards", label: "Flashcards", color: "var(--mantine-color-orange-6)" },
  { key: "goalcards", label: "Goals", color: "var(--mantine-color-lime-6)" },
  { key: "taskcards", label: "Tasks", color: "var(--mantine-color-blue-6)" },
] as const;

type ChartFrameProps = {
  height: number;
  children: ReactNode;
};

function ChartFrame({ height, children }: ChartFrameProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const node = hostRef.current;
    if (!node) return;

    const updateReady = () => {
      setIsReady(node.clientWidth > 0 && node.clientHeight > 0);
    };

    updateReady();
    const observer = new ResizeObserver(() => updateReady());
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  return (
    <Box ref={hostRef} h={height} w="100%" style={{ minWidth: 0 }}>
      {isReady ? children : null}
    </Box>
  );
}

export default function LocalAiMissionControlPage() {
  const { language } = useI18n();
  const pageText = PAGE_TEXT[language] ?? PAGE_TEXT.en;
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch(STATUS_API_URL, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Status server returned ${response.status}`);
        }
        const payload = await response.json();
        if (cancelled) return;
        setData(payload);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const queue = data?.queue || {};
  const currentJob = queue.currentJob || null;
  const nextJobs = queue.nextJobs || [];
  const hardening = queue.hardening || {};
  const inventory = data?.inventory || {};
  const inventoryHistory = Array.isArray(data?.inventoryHistory) ? [...data.inventoryHistory] : [];
  const worker = data?.worker || {};
  const backgroundWorker = data?.backgroundWorker || {};
  const guardian = data?.guardian || {};
  const memoryGovernor = data?.memoryGovernor || {};
  const verification = data?.verification || null;
  const opportunitycardRepair = data?.opportunitycardRepair || {};
  const topology = data?.topology || {};
  const projections = data?.projections || {};
  const projectionCoverage = projections?.coverage || {};
  const buildIdentity = worker?.settings?.buildIdentity || {};
  const actualCurrentTask = String(worker.activeTask || "Idle");
  const actualCurrentCompany = String(worker.currentCompany || "No company locked");
  const topQueueJobLabel = currentJob ? formatJobLabel(language, currentJob) : "No queued job";
  const memoryGovernorEvents = Array.isArray(memoryGovernor.recentEvents) ? memoryGovernor.recentEvents : [];
  const latestGovernorEvaluation = memoryGovernor.latestEvaluation || {};
  const topologyRecentSyncs = Array.isArray(topology?.recentSyncs) ? topology.recentSyncs : [];
  const topologyDirtyCompanies = Array.isArray(topology?.dirtyCompanies) ? topology.dirtyCompanies : [];
  const projectionRecentRefreshes = Array.isArray(projections?.recentRefreshes) ? projections.recentRefreshes : [];
  const projectionDirtyCompanies = Array.isArray(projections?.dirtyCompanies) ? projections.dirtyCompanies : [];
  const verificationChecks = Array.isArray(verification?.checks) ? verification.checks : [];
  const failingVerificationChecks = verificationChecks.filter((check: any) => !check.ok).slice(0, 4);

  const cardCountChartData = [
    { family: "Datacards", count: Number(inventory.datacards ?? 0) },
    { family: "Flashcards", count: Number(inventory.flashcards ?? 0) },
    { family: "Goals", count: Number(inventory.goalcards ?? 0) },
    { family: "Tasks", count: Number(inventory.taskcards ?? 0) },
  ];

  const queueByCompanyChartData =
    (queue.companyQueueDepth || []).slice(0, 8).map((row: any) => ({
      company: row.companyName,
      jobs: Number(row.activeJobs ?? 0),
    }));

  const inventoryHistoryChartData = inventoryHistory
    .sort((left: any, right: any) => new Date(left.bucketStart || 0).getTime() - new Date(right.bucketStart || 0).getTime())
    .slice(-48)
    .map((point: any) => ({
      hour: formatHistoryHourLabel(point.bucketStart),
      bucketStart: point.bucketStart,
      datacards: Number(point.datacards ?? 0),
      flashcards: Number(point.flashcards ?? 0),
      goalcards: Number(point.goalcards ?? 0),
      taskcards: Number(point.taskcards ?? 0),
      totalCards: Number(point.totalCards ?? 0),
    }));

  type InventoryHistoryPoint = (typeof inventoryHistoryChartData)[number];
  const inventoryDeltaChartData = inventoryHistoryChartData
    .map((point: InventoryHistoryPoint, index: number, series: InventoryHistoryPoint[]) => {
      if (index === 0) return null;
      const previous = series[index - 1];
      return {
        hour: point.hour,
        bucketStart: point.bucketStart,
        datacardsDelta: point.datacards - previous.datacards,
        flashcardsDelta: point.flashcards - previous.flashcards,
        goalcardsDelta: point.goalcards - previous.goalcards,
        taskcardsDelta: point.taskcards - previous.taskcards,
        totalCardsDelta: point.totalCards - previous.totalCards,
      };
    })
    .filter(Boolean) as Array<{
      hour: string;
      bucketStart: string;
      datacardsDelta: number;
      flashcardsDelta: number;
      goalcardsDelta: number;
      taskcardsDelta: number;
      totalCardsDelta: number;
    }>;

  const latestDeltaPoint = inventoryDeltaChartData[inventoryDeltaChartData.length - 1] || null;

  return (
    <PageShell width="full">
      <PageHeader
        title={pageText.title}
        description={pageText.description}
        actions={
          <Group gap="sm">
            <Anchor component={Link} href={RAW_HEALTH_URL} target="_blank" rel="noreferrer">{pageText.rawHealth}</Anchor>
            <Anchor component={Link} href={RAW_SNAPSHOT_HEALTH_URL} target="_blank" rel="noreferrer">{pageText.rawSnapshotHealth}</Anchor>
            <Anchor component={Link} href={RAW_COMMAND_CENTER_URL} target="_blank" rel="noreferrer">{pageText.rawCommandCenter}</Anchor>
          </Group>
        }
      />

      {loading ? (
        <Stack align="center" py="xl">
          <Loader />
        </Stack>
      ) : null}

      {error ? (
        <Notice title={pageText.unavailable} icon={AlertTriangle} variant="destructive">
          {error}. {pageText.unavailableBody}
        </Notice>
      ) : null}

      {!loading && !error ? (
        <Stack gap="lg">
          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="md">
            <MetricCard icon={Heartbeat} color="review" label="Worker State" value={String(worker.state || "unknown")} detail={String(worker.stage || "—")} />
            <MetricCard icon={ListCheck} color="strategy" label="Execution Mode" value="LINEAR" detail="one foreground worker · one queue job" />
            <MetricCard icon={Brain} color="strategy" label="Current Company" value={actualCurrentCompany} detail={worker.currentCompany ? "Worker-locked company" : "No company locked right now"} />
            <MetricCard icon={ListCheck} color="checklist" label="Current Task" value={actualCurrentTask} detail={worker.currentCompany ? "Worker runtime authority" : String(worker.stage || "—")} />
            <MetricCard icon={Server} color="knowmore" label="Worker Build" value={String(buildIdentity.appVersion || "unknown")} detail={String(buildIdentity.gitSha || "—").slice(0, 12)} />
            <MetricCard icon={Server} color="strategy" label="Background State" value={String(backgroundWorker.state || "unknown")} detail="support lane only" />
            <MetricCard icon={Activity} color="review" label="Queue Depth" value={queue.totalActiveJobs ?? 0} detail={`${queue.runningJobs ?? 0} running · ${queue.failedJobs ?? 0} failed · ${queue.pausedJobs ?? 0} paused`} />
            <MetricCard icon={Activity} color="tactical" label="Opportunity Repair" value={String(opportunitycardRepair.status || "PENDING")} detail={`${opportunitycardRepair.updated ?? 0} updated · ${opportunitycardRepair.processed ?? 0} processed`} />
            <MetricCard icon={Hierarchy} color="tactical" label="Datacards" value={inventory.datacards ?? 0} detail={`${inventory.sources ?? 0} sources · ${inventory.files ?? 0} files`} />
            <MetricCard icon={Brain} color="strategy" label="Cards" value={inventory.totalCards ?? 0} detail={`${inventory.flashcards ?? 0} flashcards · ${inventory.goalcards ?? 0} goals · ${inventory.taskcards ?? 0} tasks`} />
            <MetricCard icon={Heartbeat} color="review" label="Guardian" value={guardian.workerAlive ? "Watching" : "Degraded"} detail={`${formatTimestamp(guardian.lastHealthAt)} · ${guardian.resources?.freeMem ?? "—"}MB free`} />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <UnifiedCard tone="review">
              <UnifiedCardHeader
                title="Live Runtime"
                supporting={<Badge variant="light" color="review">{worker.stage || "IDLE"}</Badge>}
              />
              <UnifiedCardBody>
                {currentJob ? (
                  <UnifiedCard tone="checklist">
                    <UnifiedCardHeader
                      title="Top Queue Job"
                      supporting={
                        <Group gap="xs">
                          <Badge variant="light" color="checklist">{currentJob.status}</Badge>
                          <Badge variant="light" color={getExecutionProfileColor(currentJob.executionProfile)}>
                            {getExecutionProfileLabel(currentJob.executionProfile)}
                          </Badge>
                          {getDecompositionTone(currentJob) ? (
                            <Badge variant="outline" color={getDecompositionTone(currentJob)?.color}>
                              {getDecompositionTone(currentJob)?.label}
                            </Badge>
                          ) : null}
                        </Group>
                      }
                    />
                    <UnifiedCardBody>
                      <Stack gap="xs">
                        <BodyText>{topQueueJobLabel}</BodyText>
                        <MetaText>{pageText.company}: {currentJob.companyName || currentJob.companyId || "—"}</MetaText>
                        <MetaText>{pageText.queue}: {currentJob.queueColumn || "—"} · {pageText.priority} {Math.round(Number(currentJob.priorityScore ?? 0))}</MetaText>
                        <MetaText>{pageText.attempts}: {Number(currentJob.attemptCount ?? 0)} · {pageText.profile}: {getExecutionProfileLabel(currentJob.executionProfile)}</MetaText>
                        <MetaText>{pageText.reason}: {translatePipelineReason(language, currentJob.reason) || pageText.noPlannerReason}</MetaText>
                        <MetaText>{pageText.updated}: {formatTimestamp(currentJob.updatedAt)}</MetaText>
                      </Stack>
                    </UnifiedCardBody>
                  </UnifiedCard>
                ) : (
                  <Notice title={pageText.noCurrentTask}>{pageText.noCurrentTaskBody}</Notice>
                )}

                <Notice title="Raw worker stage">
                  {actualCurrentTask}
                </Notice>
                <Notice title="Background snapshot lane">
                  {String(backgroundWorker.activeTask || "Waiting for snapshot work")}
                </Notice>
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="tactical">
              <UnifiedCardHeader
                title="Pipeline Next"
                supporting={<Badge variant="light" color="tactical">next {nextJobs.length}</Badge>}
              />
              <UnifiedCardBody>
                <Stack gap="xs">
                  {nextJobs.length ? nextJobs.map((job: any, index: number) => (
                    <Group
                      key={job.id}
                      justify="space-between"
                      align="flex-start"
                      p="sm"
                      style={{
                        border: "1px solid var(--border-primary)",
                        borderRadius: "12px",
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <Stack gap={2} flex={1}>
                        <Group gap="xs">
                          <Badge variant="light" color={job.queueColumn === "NOW" ? "checklist" : job.queueColumn === "SOON" ? "tactical" : job.queueColumn === "LATER" ? "strategy" : "gray"}>
                            #{index + 1}
                          </Badge>
                          <Badge variant="light" color={getExecutionProfileColor(job.executionProfile)}>
                            {getExecutionProfileLabel(job.executionProfile)}
                          </Badge>
                          {getDecompositionTone(job) ? (
                            <Badge variant="outline" color={getDecompositionTone(job)?.color}>
                              {getDecompositionTone(job)?.label}
                            </Badge>
                          ) : null}
                          <BodyText>{formatJobLabel(language, job)}</BodyText>
                        </Group>
                        <MetaText>{translatePipelineReason(language, job.reason) || pageText.noPlannerReasonPersisted}</MetaText>
                      </Stack>
                      <Stack gap={2} align="flex-end">
                        <Badge variant="outline" color="gray">{job.queueColumn}</Badge>
                        <MetaText>{Math.round(Number(job.priorityScore ?? 0))}</MetaText>
                      </Stack>
                    </Group>
                  )) : (
                    <Notice title={pageText.queueClear}>{pageText.queueClearBody}</Notice>
                  )}
                </Stack>
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="review">
              <UnifiedCardHeader
                title="Runtime Hardening"
                supporting={<Badge variant="light" color="review">{latestGovernorEvaluation.resourceBand || guardian.resources?.resourceBand || "unknown"}</Badge>}
              />
              <UnifiedCardBody>
                <SimpleGrid cols={{ base: 2, md: 3 }} spacing="sm">
                  <MetricCard icon={Activity} color="tactical" label="Degraded" value={hardening.degradedJobs ?? 0} detail="jobs using reduced profile" />
                  <MetricCard icon={Activity} color="review" label="Minimal" value={hardening.minimalJobs ?? 0} detail="jobs using smallest profile" />
                  <MetricCard icon={Hierarchy} color="review" label="Child Slices" value={hardening.activeChildSlices ?? 0} detail="active bounded child jobs" />
                  <MetricCard icon={Hierarchy} color="strategy" label="Paused Parents" value={hardening.decomposedParentJobs ?? 0} detail="decomposed parents waiting" />
                  <MetricCard icon={AlertTriangle} color="review" label="Deferred" value={hardening.lowMemoryDeferredJobs ?? 0} detail="recent low-memory pressure" />
                  <MetricCard icon={AlertTriangle} color="review" label="Starved" value={hardening.starvedJobs ?? 0} detail="jobs at 3+ attempts" />
                </SimpleGrid>
                <Notice title="Memory governor">
                  Last action: {memoryGovernor.lastActionReason || "none"} · Last action at {formatTimestamp(memoryGovernor.lastActionAt)} · Policy v{memoryGovernor.policyVersion || "?"}
                </Notice>
                <Notice title="Runtime verification">
                  {pageText.verificationSummary
                    .replace("{{ts}}", formatTimestamp(verification?.ts))
                    .replace("{{passed}}", String(verification?.summary?.passedChecks ?? 0))
                    .replace("{{total}}", String(verification?.summary?.totalChecks ?? 0))
                    .replace("{{trigger}}", String(verification?.trigger || "—"))
                    .replace("{{status}}", verification?.summary?.ok ? "PASS" : "FAIL")}
                </Notice>
                {opportunitycardRepair?.status !== "COMPLETED" ? (
                  <Notice title="Opportunitycard contract repair">
                    Status {String(opportunitycardRepair?.status || "PENDING")} · Updated {opportunitycardRepair?.updated ?? 0} after inspecting {opportunitycardRepair?.processed ?? 0} · Last run {formatTimestamp(opportunitycardRepair?.lastRunAt)}
                  </Notice>
                ) : null}
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="strategy">
              <UnifiedCardHeader title="Sum of Cards" supporting={<Badge variant="light" color="strategy">global totals</Badge>} />
              <UnifiedCardBody>
                <ChartFrame height={320}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cardCountChartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                      <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="family" tickLine={false} axisLine={false} />
                      <YAxis tickLine={false} axisLine={false} />
                      <Tooltip formatter={(value) => chartTooltipFormatter(value)} />
                      <Bar dataKey="count" fill="var(--mantine-color-orange-6)" radius={[10, 10, 0, 0]} isAnimationActive={false} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartFrame>
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="strategy">
              <UnifiedCardHeader
                title="Sum of Cards Change"
                supporting={<Badge variant="light" color="strategy">hourly history</Badge>}
              />
              <UnifiedCardBody>
                {inventoryDeltaChartData.length ? (
                  <ChartFrame height={320}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={inventoryDeltaChartData} margin={{ top: 8, right: 16, left: -20, bottom: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="hour" tickLine={false} axisLine={false} minTickGap={24} />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip formatter={(value) => deltaTooltipFormatter(value)} labelFormatter={(value) => `Hour: ${value}`} />
                        <Bar dataKey="totalCardsDelta" fill="var(--mantine-color-orange-6)" radius={[10, 10, 0, 0]} isAnimationActive={false} name="Total cards" />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                ) : (
                  <Notice title="Not enough hourly history yet">The status server needs at least two hourly snapshots before it can calculate change.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="knowmore">
              <UnifiedCardHeader title="Queue by Company" supporting={<Badge variant="light" color="knowmore">nice to have</Badge>} />
              <UnifiedCardBody>
                {(queueByCompanyChartData || []).length ? (
                  <ChartFrame height={320}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={queueByCompanyChartData} margin={{ top: 8, right: 8, left: -20, bottom: 8 }}>
                        <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="company" tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={72} />
                        <YAxis tickLine={false} axisLine={false} />
                        <Tooltip formatter={(value) => chartTooltipFormatter(value)} />
                        <Bar dataKey="jobs" fill="var(--mantine-color-cyan-6)" radius={[10, 10, 0, 0]} isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartFrame>
                ) : (
                  <Notice title="No global queue pressure">No company currently has queued work waiting in the global pipeline.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <UnifiedCard tone="strategy">
              <UnifiedCardHeader
                title="Runtime Verification"
                supporting={
                  <Badge variant="light" color={verification?.summary?.ok ? "strategy" : "review"}>
                    {verification?.summary?.ok ? "PASS" : "FAIL"}
                  </Badge>
                }
              />
              <UnifiedCardBody>
                {verification ? (
                  <Stack gap="sm">
                    <MetaText>
                      Last run {formatTimestamp(verification.ts)} · Mode {verification.mode || "—"} · Trigger {verification.trigger || "—"}
                    </MetaText>
                    <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm">
                      <MetricCard icon={Activity} color="strategy" label="Checks" value={verification?.summary?.totalChecks ?? 0} detail="runtime contract checks" />
                      <MetricCard icon={Heartbeat} color="strategy" label="Passed" value={verification?.summary?.passedChecks ?? 0} detail="green checks" />
                      <MetricCard icon={AlertTriangle} color="review" label="Failed" value={verification?.summary?.failedChecks ?? 0} detail="needs operator attention" />
                      <MetricCard icon={Hierarchy} color="tactical" label="Queue State" value={verification?.snapshot?.queue?.runningJobs ?? 0} detail={`${verification?.snapshot?.queue?.totalActiveJobs ?? 0} active`} />
                    </SimpleGrid>
                    {failingVerificationChecks.length ? (
                      <Table highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Check</Table.Th>
                            <Table.Th>Summary</Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {failingVerificationChecks.map((check: any) => (
                            <Table.Tr key={check.id}>
                              <Table.Td>{check.id}</Table.Td>
                              <Table.Td>{check.summary}</Table.Td>
                            </Table.Tr>
                          ))}
                        </Table.Tbody>
                      </Table>
                    ) : (
                      <Notice title="Verification passing">The latest scheduled runtime verification found no contract failures.</Notice>
                    )}
                  </Stack>
                ) : (
                  <Notice title="No runtime verification yet">The background worker has not persisted a runtime verification report yet.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="review">
              <UnifiedCardHeader
                title="Recent Deferred Or Decomposed Jobs"
                supporting={<Badge variant="light" color="review">{(queue.recentDeferredJobs || []).length}</Badge>}
              />
              <UnifiedCardBody>
                {(queue.recentDeferredJobs || []).length ? (
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Company</Table.Th>
                        <Table.Th>Job</Table.Th>
                        <Table.Th>Mode</Table.Th>
                        <Table.Th>Reason</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {(queue.recentDeferredJobs || []).map((job: any) => (
                        <Table.Tr key={job.id}>
                          <Table.Td>{job.companyName || job.companyId || "—"}</Table.Td>
                            <Table.Td>{formatJobLabel(language, job)}</Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <Badge variant="light" color={getExecutionProfileColor(job.executionProfile)}>
                                {getExecutionProfileLabel(job.executionProfile)}
                              </Badge>
                              {getDecompositionTone(job) ? (
                                <Badge variant="outline" color={getDecompositionTone(job)?.color}>
                                  {getDecompositionTone(job)?.label}
                                </Badge>
                              ) : null}
                            </Group>
                          </Table.Td>
                          <Table.Td>{job.reason || job.lastError || "—"}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Notice title="No recent pressure">The queue has no recent deferred or decomposed jobs right now.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="strategy">
              <UnifiedCardHeader
                title="Memory Governor Events"
                supporting={<Badge variant="light" color="strategy">{memoryGovernorEvents.length} recent</Badge>}
              />
              <UnifiedCardBody>
                {memoryGovernorEvents.length ? (
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>When</Table.Th>
                        <Table.Th>Action</Table.Th>
                        <Table.Th>Tier</Table.Th>
                        <Table.Th>Context</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {memoryGovernorEvents.map((event: any, index: number) => (
                        <Table.Tr key={`${event.ts || "event"}-${index}`}>
                          <Table.Td>{formatTimestamp(event.ts)}</Table.Td>
                          <Table.Td>{event.action || "NONE"}</Table.Td>
                          <Table.Td>{event.tierKey || event.reason || "—"}</Table.Td>
                          <Table.Td>
                            {event.freeMemMb ?? "—"}MB · {event.workerStage || "—"} · {event.currentCompany || "—"}
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Notice title="No recent governor interventions">The memory governor has not needed to intervene recently.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <UnifiedCard tone="knowmore">
              <UnifiedCardHeader
                title="Topology Sync"
                supporting={<Badge variant="light" color="knowmore">{topologyDirtyCompanies.length} dirty</Badge>}
              />
              <UnifiedCardBody>
                <Notice title="Targeted queue ownership">
                  Productive company work now marks that company as topology-dirty, and `snapshot-worker` drains those targeted refreshes before slower global sync.
                </Notice>
                {topologyRecentSyncs.length ? (
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>When</Table.Th>
                        <Table.Th>Company</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Reason</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {topologyRecentSyncs.map((entry: any, index: number) => (
                        <Table.Tr key={`${entry.companyId || "company"}-${entry.syncedAt || index}`}>
                          <Table.Td>{formatTimestamp(entry.syncedAt)}</Table.Td>
                          <Table.Td>{entry.companyName || entry.companyId || "—"}</Table.Td>
                          <Table.Td>
                            <Badge variant="light" color={entry.status === "SYNCED" ? "strategy" : "review"}>
                              {entry.status || "—"}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{entry.reason || entry.trigger || "—"}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Notice title="No targeted syncs yet">No company-specific topology sync has been recorded since the current retention window began.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="tactical">
              <UnifiedCardHeader
                title="Dirty Companies"
                supporting={<Badge variant="light" color="tactical">{topologyDirtyCompanies.length} queued</Badge>}
              />
              <UnifiedCardBody>
                {topologyDirtyCompanies.length ? (
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Company ID</Table.Th>
                        <Table.Th>Reason</Table.Th>
                        <Table.Th>Requested</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {topologyDirtyCompanies.slice(0, 8).map((entry: any, index: number) => (
                        <Table.Tr key={`${entry.companyId || "company"}-${entry.requestedAt || index}`}>
                          <Table.Td>{entry.companyId || "—"}</Table.Td>
                          <Table.Td>{entry.reason || "topology-change"}</Table.Td>
                          <Table.Td>{formatTimestamp(entry.requestedAt)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Notice title="No pending topology refresh">The background worker does not currently have any touched-company topology refresh requests queued.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, xl: 2 }} spacing="lg">
            <UnifiedCard tone="strategy">
              <UnifiedCardHeader
                title="Projection Refresh"
                supporting={<Badge variant="light" color="strategy">{projectionDirtyCompanies.length} dirty</Badge>}
              />
              <UnifiedCardBody>
                <Notice title="Touched-company read-model repair">
                  Successful company work now marks that company as projection-dirty, and `snapshot-worker` refreshes those webapp-ready projections before the slower broad snapshot sweep.
                </Notice>
                {projectionRecentRefreshes.length ? (
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>When</Table.Th>
                        <Table.Th>Company</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Reason</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {projectionRecentRefreshes.map((entry: any, index: number) => (
                        <Table.Tr key={`${entry.companyId || "company"}-${entry.refreshedAt || index}`}>
                          <Table.Td>{formatTimestamp(entry.refreshedAt)}</Table.Td>
                          <Table.Td>{entry.companyName || entry.companyId || "—"}</Table.Td>
                          <Table.Td>
                            <Badge variant="light" color={entry.status === "REFRESHED" ? "strategy" : "review"}>
                              {entry.status || "—"}
                            </Badge>
                          </Table.Td>
                          <Table.Td>{entry.reason || entry.trigger || "—"}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Notice title="No targeted projection refreshes yet">No company-specific webapp projection refresh has been recorded since the current retention window began.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="strategy">
              <UnifiedCardHeader
                title="Projection Coverage"
                supporting={<Badge variant="light" color="strategy">{projectionCoverage.ready || 0}/{projectionCoverage.totalCompanies || 0} ready</Badge>}
              />
              <UnifiedCardBody>
                <Notice title="Prepared product read coverage">
                  Product routes should read prepared company projections first. Missing or outdated projections are now backfilled by `snapshot-worker` before slower broad refresh sweeps.
                </Notice>
                <SimpleGrid cols={{ base: 2, md: 3 }} spacing="md">
                  <MetricCard icon={Activity} color="strategy" label="Fresh" value={projectionCoverage.fresh ?? 0} />
                  <MetricCard icon={AlertTriangle} color="review" label="Aging" value={projectionCoverage.aging ?? 0} />
                  <MetricCard icon={AlertTriangle} color="review" label="Stale" value={projectionCoverage.stale ?? 0} />
                  <MetricCard icon={Hierarchy} color="review" label="Missing" value={projectionCoverage.missing ?? 0} />
                  <MetricCard icon={Server} color="review" label="Outdated Ver." value={projectionCoverage.outdatedVersion ?? 0} />
                  <MetricCard icon={Brain} color="knowmore" label="Total" value={projectionCoverage.totalCompanies ?? 0} />
                </SimpleGrid>
              </UnifiedCardBody>
            </UnifiedCard>

            <UnifiedCard tone="strategy">
              <UnifiedCardHeader
                title="Dirty Projections"
                supporting={<Badge variant="light" color="strategy">{projectionDirtyCompanies.length} queued</Badge>}
              />
              <UnifiedCardBody>
                {projectionDirtyCompanies.length ? (
                  <Table highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Company ID</Table.Th>
                        <Table.Th>Reason</Table.Th>
                        <Table.Th>Requested</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {projectionDirtyCompanies.slice(0, 8).map((entry: any, index: number) => (
                        <Table.Tr key={`${entry.companyId || "company"}-${entry.requestedAt || index}`}>
                          <Table.Td>{entry.companyId || "—"}</Table.Td>
                          <Table.Td>{entry.reason || "projection-repair"}</Table.Td>
                          <Table.Td>{formatTimestamp(entry.requestedAt)}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                ) : (
                  <Notice title="No pending projection refresh">The background worker does not currently have any touched-company webapp projection refresh requests queued.</Notice>
                )}
              </UnifiedCardBody>
            </UnifiedCard>
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2, xl: 4 }} spacing="lg">
            {CARD_TYPE_HISTORY.map((entry) => (
              <UnifiedCard key={entry.key} tone="strategy">
                <UnifiedCardHeader
                  title={`${entry.label} Hourly Change`}
                  supporting={
                    <Badge variant="light" color="strategy">
                      {latestDeltaPoint
                        ? formatSignedValue(
                            Number(
                              latestDeltaPoint[
                                `${entry.key}Delta` as "datacardsDelta" | "flashcardsDelta" | "goalcardsDelta" | "taskcardsDelta"
                              ] ?? 0,
                            ),
                          )
                        : "no delta"}
                    </Badge>
                  }
                />
                <UnifiedCardBody>
                  {inventoryDeltaChartData.length ? (
                    <ChartFrame height={220}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={inventoryDeltaChartData} margin={{ top: 8, right: 8, left: -24, bottom: 8 }}>
                          <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="rgba(255,255,255,0.08)" />
                          <XAxis dataKey="hour" tickLine={false} axisLine={false} minTickGap={24} />
                          <YAxis tickLine={false} axisLine={false} />
                          <Tooltip formatter={(value) => deltaTooltipFormatter(value)} labelFormatter={(value) => `Hour: ${value}`} />
                          <Bar
                            dataKey={`${entry.key}Delta`}
                            fill={entry.color}
                            radius={[10, 10, 0, 0]}
                            isAnimationActive={false}
                            name={entry.label}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartFrame>
                  ) : (
                    <Notice title="Not enough hourly history yet">No prior hour exists yet for {entry.label.toLowerCase()} change.</Notice>
                  )}
                </UnifiedCardBody>
              </UnifiedCard>
            ))}
          </SimpleGrid>

          <UnifiedCard tone="review">
            <UnifiedCardHeader title={pageText.recentFailedJobs} />
            <UnifiedCardBody>
              {(queue.recentFailedJobs || []).length ? (
                <Table highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Company</Table.Th>
                      <Table.Th>Job</Table.Th>
                      <Table.Th>Entity</Table.Th>
                      <Table.Th>Error</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {(queue.recentFailedJobs || []).map((job: any) => (
                      <Table.Tr key={job.id}>
                        <Table.Td>{job.companyName || job.companyId}</Table.Td>
                        <Table.Td>{job.jobType}</Table.Td>
                        <Table.Td>{job.entityLabel || job.entityType || "—"}</Table.Td>
                        <Table.Td>{job.lastError || "—"}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : (
                <Notice title="No recent failed jobs">The global pipeline does not currently report failed jobs.</Notice>
              )}
            </UnifiedCardBody>
          </UnifiedCard>
        </Stack>
      ) : null}
    </PageShell>
  );
}
