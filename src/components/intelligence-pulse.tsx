"use client";

import { useEffect, useState } from "react";
import { IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconCircleCheck as CheckCircle2, IconGauge as Gauge, IconTimeline as Timeline, IconBolt as Zap } from "@tabler/icons-react";
import { 
  Stack, 
  Group, 
  Text, 
  Badge, 
  Box, 
  SimpleGrid, 
  ThemeIcon,
  rem,
  Progress,
  Tooltip,
  Center,
  Loader,
  Title
} from "@mantine/core";
import { formatDistanceToNow } from 'date-fns';
import { getModuleTheme } from "@/lib/semantic-theme";
import { resolveStateTone } from "@/lib/ui-state";
import { UnifiedCard, UnifiedCardBody } from "@/components/ui/unified-card";

type HealthData = {
  status: string;
  uptime: string;
  timestamp: string;
  stage?: string;
  currentCompany?: string;
  activeTask?: string;
  activeModel?: string;
  settings?: {
    failsafeModel?: string;
  };
  metrics: {
    total_cycles: number;
    avg_cycle_duration: string;
    total_operations: number;
    failure_rate: string;
    backlog: {
      draft_cards: number;
      checked_cards: number;
    };
    cycleHistory?: Array<{
      timestamp: string;
      ops: number;
      duration: string;
      failRate: string;
    }>;
  };
  errorStats?: {
    attempts: number;
    failures: number;
    rate: string;
    streak: number;
  };
};

export function IntelligencePulse() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await fetch("/api/intelligence/health");
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error("Pulse fetch failed", err);
      } finally {
        setLoading(false);
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return null;

  if (!data || data.status === "OFFLINE") {
    return (
      <UnifiedCard tone="review">
        <UnifiedCardBody>
        <Group gap="md" wrap="nowrap">
          <ThemeIcon color={resolveStateTone("danger")} variant="light">
            <AlertTriangle size={24} />
          </ThemeIcon>
          <Stack gap={2}>
            <Title order={4} c="review">Intelligence Engine Offline</Title>
            <Text size="xs" c="dimmed">The background worker is not responding. Strategic synthesis is currently paused.</Text>
          </Stack>
        </Group>
        </UnifiedCardBody>
      </UnifiedCard>
    );
  }

  const failRate = parseFloat(data.metrics.failure_rate);
  const isHealthy = failRate < 10;
  const isWarning = failRate >= 10 && failRate < 20;
  const statusColor = isHealthy ? "knowmore" : isWarning ? "review" : "review";
  const reviewTheme = getModuleTheme("review");
  const neutralTheme = getModuleTheme("neutral");
  const knowmoreTheme = getModuleTheme("knowmore");

  return (
    <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
      {/* Real-time Status */}
      <UnifiedCard tone="neutral">
        <UnifiedCardBody>
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <ThemeIcon variant="transparent" color="review" size="sm">
                <Zap size={14} />
              </ThemeIcon>
              <Text size="xs" c="dimmed">Engine Pulse</Text>
            </Group>
            <Badge variant="dot" color={statusColor} size="xs">LIVE</Badge>
          </Group>

          <Stack gap="sm">
            <Box>
              <Group justify="space-between" mb={2}>
                <Text size="xs" c="dimmed">Active Context</Text>
                <Text size="xs" c="dimmed" truncate maw={120}>
                  {data.activeModel || data.settings?.failsafeModel?.split('|')[0]?.split(':')[1]?.trim() || "TRINITY-V1"}
                </Text>
              </Group>
              <Text size="sm" c="var(--text-primary)" truncate>{data.currentCompany || "Idle Rotation"}</Text>
              <Text size="xs" c="dimmed" truncate mt={2}>
                {data.activeTask || "Scanning for signal..."}
              </Text>
            </Box>
            
            <Box>
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">Workflow Stage</Text>
                <Text size="xs" c="knowmore">{data.stage || "IDLE"}</Text>
              </Group>
              <Group gap={4} grow>
                {['RESEARCH', 'SCRUB', 'WRITE', 'JUDGE'].map((s) => {
                  const isActive = data.stage?.includes(s) || (s === 'SCRUB' && data.stage === 'SCRUBBING');
                  return (
                    <Box 
                      key={s} 
                      h={rem(4)} 
                      style={{ 
                        borderRadius: rem(2),
                        backgroundColor: isActive ? reviewTheme.color : neutralTheme.border,
                      }} 
                    />
                  );
                })}
              </Group>
            </Box>
          </Stack>
        </Stack>
        </UnifiedCardBody>
      </UnifiedCard>

      {/* Throughput Yield */}
      <UnifiedCard tone="neutral">
        <UnifiedCardBody>
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon variant="transparent" color="ingress" size="sm">
              <Gauge size={14} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">Throughput Yield</Text>
          </Group>

          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="xs" c="dimmed">Cycle Operations</Text>
              <Text size="sm">{data.metrics.total_operations}</Text>
            </Group>
            
            <Box>
              <Group justify="space-between" mb={4}>
                <Text size="xs" c="dimmed">Backlog Volume</Text>
                <Text size="xs">{data.metrics.backlog.draft_cards + data.metrics.backlog.checked_cards}</Text>
              </Group>
              <Progress 
                value={Math.min(100, ((data.metrics.backlog.draft_cards + data.metrics.backlog.checked_cards) / 50) * 100)} 
                size="xs" 
                color="ingress" 
              />
            </Box>

            <Group justify="space-between" mt="auto">
              <Text size="xs" c="dimmed">Last Sync</Text>
              <Text size="xs" c="dimmed">
                {data.timestamp ? formatDistanceToNow(new Date(data.timestamp), { addSuffix: true }) : 'N/A'}
              </Text>
            </Group>
          </Stack>
        </Stack>
        </UnifiedCardBody>
      </UnifiedCard>

      {/* Recent Performance */}
      <UnifiedCard tone="neutral">
        <UnifiedCardBody>
        <Stack gap="md" h="100%">
          <Group gap="xs">
            <ThemeIcon variant="transparent" color="strategy" size="sm">
              <Timeline size={14} />
            </ThemeIcon>
            <Text size="xs" c="dimmed">Performance History</Text>
          </Group>

          {data.metrics.cycleHistory && data.metrics.cycleHistory.length > 0 ? (
            <Group align="flex-end" gap={4} wrap="nowrap" style={{ flex: 1, minHeight: rem(60) }}>
              {data.metrics.cycleHistory.slice(-10).map((cycle, i) => {
                const height = Math.max(10, Math.min(100, (cycle.ops / 10) * 100));
                const fail = parseFloat(cycle.failRate);
                const barColor = fail < 10 ? knowmoreTheme.color : reviewTheme.color;
                return (
                  <Tooltip 
                    key={i} 
                    label={`Cycle: ${cycle.ops} ops, ${cycle.failRate}% fail`}
                    position="top"
                    withArrow
                  >
                    <Box 
                      style={{ 
                        flex: 1, 
                        height: `${height}%`,
                        backgroundColor: barColor,
                        opacity: 0.4,
                        borderRadius: '2px 2px 0 0',
                        cursor: 'pointer'
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Group>
          ) : (
            <Center h={rem(60)}>
              <Text size="xs" c="dimmed" fs="italic">Initializing history stream...</Text>
            </Center>
          )}

          <Group justify="space-between" mt="auto">
            <Text size="xs" c="dimmed">Last 10 Cycles</Text>
            <Group gap={6}>
              <Box h={6} w={6} style={{ borderRadius: '50%', backgroundColor: knowmoreTheme.color }} />
              <Text size="xs" c="dimmed">Success</Text>
            </Group>
          </Group>
        </Stack>
        </UnifiedCardBody>
      </UnifiedCard>
    </SimpleGrid>
  );
}
