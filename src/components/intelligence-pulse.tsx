"use client";

import { useEffect, useState } from "react";
import { IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconCircleCheck as CheckCircle2, IconCpu as Cpu, IconHistory as History, IconBolt as Zap } from "@tabler/icons-react";
import { 
  Card, 
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
  Loader
} from "@mantine/core";
import { formatDistanceToNow } from 'date-fns';

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
      <Card radius="lg" withBorder style={{ backgroundColor: 'rgba(250, 82, 82, 0.05)', borderColor: 'rgba(250, 82, 82, 0.2)' }}>
        <Group gap="md" wrap="nowrap">
          <ThemeIcon color="red" variant="light" size="xl" radius="md">
            <AlertTriangle size={24} />
          </ThemeIcon>
          <Stack gap={2}>
            <Text fw={900} size="sm" c="red" tt="uppercase" lts={1}>Intelligence Engine Offline</Text>
            <Text size="xs" c="dimmed" fw={500}>The background worker is not responding. Strategic synthesis is currently paused.</Text>
          </Stack>
        </Group>
      </Card>
    );
  }

  const failRate = parseFloat(data.metrics.failure_rate);
  const isHealthy = failRate < 10;
  const isWarning = failRate >= 10 && failRate < 20;
  const statusColor = isHealthy ? "green" : isWarning ? "orange" : "red";

  return (
    <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
      {/* Real-time Status */}
      <Card radius="lg" withBorder p="md" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
        <Stack gap="md">
          <Group justify="space-between">
            <Group gap="xs">
              <ThemeIcon variant="transparent" color="orange" size="sm">
                <Zap size={14} />
              </ThemeIcon>
              <Text size="xs" fw={900} tt="uppercase" lts={1.5} c="dimmed">Engine Pulse</Text>
            </Group>
            <Badge variant="dot" color={statusColor} size="xs" fw={900}>LIVE</Badge>
          </Group>

          <Stack gap="sm">
            <Box>
              <Group justify="space-between" mb={2}>
                <Text size="xs" fw={900} tt="uppercase" lts={1} c="dimmed">Active Context</Text>
                <Text size="xs" ff="monospace" c="dimmed" truncate maw={120}>
                  {data.activeModel || data.settings?.failsafeModel?.split('|')[0]?.split(':')[1]?.trim() || "TRINITY-V1"}
                </Text>
              </Group>
              <Text size="sm" fw={800} c="white" truncate>{data.currentCompany || "Idle Rotation"}</Text>
              <Text size="xs" c="dimmed" fs="italic" truncate mt={2}>
                {data.activeTask || "Scanning for signal..."}
              </Text>
            </Box>
            
            <Box>
              <Group justify="space-between" mb={4}>
                <Text size="xs" fw={900} tt="uppercase" lts={1} c="dimmed">Workflow Stage</Text>
                <Text size="xs" fw={900} c="green" tt="uppercase">{data.stage || "IDLE"}</Text>
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
                        backgroundColor: isActive ? 'var(--mantine-color-orange-filled)' : 'var(--mantine-color-dark-4)',
                        boxShadow: isActive ? '0 0 8px rgba(245,158,11,0.4)' : 'none',
                        transition: 'all 0.3s ease'
                      }} 
                    />
                  );
                })}
              </Group>
            </Box>
          </Stack>
        </Stack>
      </Card>

      {/* Throughput Yield */}
      <Card radius="lg" withBorder p="md" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon variant="transparent" color="blue" size="sm">
              <Cpu size={14} />
            </ThemeIcon>
            <Text size="xs" fw={900} tt="uppercase" lts={1.5} c="dimmed">Throughput Yield</Text>
          </Group>

          <Stack gap="sm">
            <Group justify="space-between">
              <Text size="xs" fw={700} c="dimmed">Cycle Operations</Text>
              <Text size="sm" ff="monospace" fw={900}>{data.metrics.total_operations}</Text>
            </Group>
            
            <Box>
              <Group justify="space-between" mb={4}>
                <Text size="xs" fw={700} c="dimmed">Backlog Volume</Text>
                <Text size="xs" ff="monospace" fw={900}>{data.metrics.backlog.draft_cards + data.metrics.backlog.checked_cards}</Text>
              </Group>
              <Progress 
                value={Math.min(100, ((data.metrics.backlog.draft_cards + data.metrics.backlog.checked_cards) / 50) * 100)} 
                size="xs" 
                color="blue" 
                radius="xl"
              />
            </Box>

            <Group justify="space-between" mt="auto">
              <Text size="xs" fw={900} tt="uppercase" lts={1} c="dimmed">Last Sync</Text>
              <Text size="xs" ff="monospace" c="dimmed">
                {data.timestamp ? formatDistanceToNow(new Date(data.timestamp), { addSuffix: true }) : 'N/A'}
              </Text>
            </Group>
          </Stack>
        </Stack>
      </Card>

      {/* Recent Performance */}
      <Card radius="lg" withBorder p="md" style={{ backgroundColor: 'rgba(0,0,0,0.2)' }}>
        <Stack gap="md" h="100%">
          <Group gap="xs">
            <ThemeIcon variant="transparent" color="violet" size="sm">
              <History size={14} />
            </ThemeIcon>
            <Text size="xs" fw={900} tt="uppercase" lts={1.5} c="dimmed">Performance History</Text>
          </Group>

          {data.metrics.cycleHistory && data.metrics.cycleHistory.length > 0 ? (
            <Group align="flex-end" gap={4} wrap="nowrap" style={{ flex: 1, minHeight: rem(60) }}>
              {data.metrics.cycleHistory.slice(-10).map((cycle, i) => {
                const height = Math.max(10, Math.min(100, (cycle.ops / 10) * 100));
                const fail = parseFloat(cycle.failRate);
                const barColor = fail < 10 ? "var(--mantine-color-green-filled)" : fail < 20 ? "var(--mantine-color-orange-filled)" : "var(--mantine-color-red-filled)";
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
                        transition: 'all 0.2s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
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
            <Text size="xs" fw={900} tt="uppercase" lts={1} c="dimmed">Last 10 Cycles</Text>
            <Group gap={6}>
              <Box h={6} w={6} style={{ borderRadius: '50%', backgroundColor: 'var(--mantine-color-green-filled)' }} />
              <Text size="xs" fw={800} c="dimmed" tt="uppercase" lts={0.5}>Success</Text>
            </Group>
          </Group>
        </Stack>
      </Card>
    </SimpleGrid>
  );
}
