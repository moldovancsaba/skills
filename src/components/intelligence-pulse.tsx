"use client";

import { useEffect, useState } from "react";
import { IconActivity as Activity, IconAlertTriangle as AlertTriangle, IconCircleCheck as CheckCircle2, IconGauge as Gauge, IconTimeline as Timeline, IconBolt as Zap } from "@/components/gds/icons";
import { 
  Stack, Group, Badge, Box, SimpleGrid, ThemeIcon, rem, Progress, Tooltip, Center, Loader } from "@/components/gds/primitives";
import { formatDistanceToNow } from 'date-fns';
import { getSemanticIndicatorStyle } from "@/lib/semantic-theme";
import { resolveStateTone } from "@/lib/ui-state";
import { UnifiedCard, UnifiedCardBody } from "@/components/ui/unified-card";
import { BodyText, MetaText, Text, Title } from "@/components/ui/typography";

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
  return (
    <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
      {/* Real-time status */}
      <UnifiedCard tone="neutral">
        <UnifiedCardBody>
        <Stack gap="md">
          <Group justify="space-between">
          <Group gap="xs">
            <ThemeIcon variant="subtle" color="review" size="sm">
              <Zap size={14} />
            </ThemeIcon>
            <MetaText>Engine Pulse</MetaText>
          </Group>
            <Badge variant="dot" color={statusColor} size="xs">LIVE</Badge>
          </Group>

          <Stack gap="sm">
            <Box>
              <Group justify="space-between" mb={2}>
                <MetaText>Active Context</MetaText>
                <MetaText truncate maw={120}>
                  {data.activeModel || data.settings?.failsafeModel?.split('|')[0]?.split(':')[1]?.trim() || "LOCAL-AI"}
                </MetaText>
              </Group>
              <BodyText c="var(--text-primary)" truncate>{data.currentCompany || "Idle Rotation"}</BodyText>
              <MetaText truncate mt={2}>{data.activeTask || "Scanning for signal..."}</MetaText>
            </Box>
            
            <Box>
              <Group justify="space-between" mb={4}>
                <MetaText>Workflow Stage</MetaText>
                <MetaText c="knowmore">{data.stage || "IDLE"}</MetaText>
              </Group>
              <Group gap={4} grow>
                {['RESEARCH', 'SCRUB', 'WRITE', 'JUDGE'].map((s) => {
                  const isActive = data.stage?.includes(s) || (s === 'SCRUB' && data.stage === 'SCRUBBING');
                  return (
                  <Box
                    key={s}
                    h={rem(4)}
                    style={getSemanticIndicatorStyle(isActive ? "review" : "neutral", {
                      active: true,
                      shape: "line",
                    })}
                  />
                );
              })}
              </Group>
            </Box>
          </Stack>
        </Stack>
        </UnifiedCardBody>
      </UnifiedCard>

      {/* Throughput yield */}
      <UnifiedCard tone="neutral">
        <UnifiedCardBody>
        <Stack gap="md">
          <Group gap="xs">
            <ThemeIcon variant="subtle" color="ingress" size="sm">
              <Gauge size={14} />
            </ThemeIcon>
            <MetaText>Throughput Yield</MetaText>
          </Group>

          <Stack gap="sm">
            <Group justify="space-between">
              <MetaText>Cycle Operations</MetaText>
              <BodyText c="var(--text-primary)">{data.metrics.total_operations}</BodyText>
            </Group>
            
            <Box>
              <Group justify="space-between" mb={4}>
                <MetaText>Backlog Volume</MetaText>
                <MetaText c="var(--text-primary)">{data.metrics.backlog.draft_cards + data.metrics.backlog.checked_cards}</MetaText>
              </Group>
              <Progress 
                value={Math.min(100, ((data.metrics.backlog.draft_cards + data.metrics.backlog.checked_cards) / 50) * 100)} 
                size="xs" 
                color="ingress" 
              />
            </Box>

            <Group justify="space-between" mt="auto">
              <MetaText>Last Sync</MetaText>
              <MetaText>
                {data.timestamp ? formatDistanceToNow(new Date(data.timestamp), { addSuffix: true }) : 'N/A'}
              </MetaText>
            </Group>
          </Stack>
        </Stack>
        </UnifiedCardBody>
      </UnifiedCard>

      {/* Recent performance */}
      <UnifiedCard tone="neutral">
        <UnifiedCardBody>
        <Stack gap="md" h="100%">
          <Group gap="xs">
            <ThemeIcon variant="subtle" color="strategy" size="sm">
              <Timeline size={14} />
            </ThemeIcon>
            <MetaText>Performance History</MetaText>
          </Group>

          {data.metrics.cycleHistory && data.metrics.cycleHistory.length > 0 ? (
            <Group align="flex-end" gap={4} wrap="nowrap" flex={1} mih={rem(60)}>
              {data.metrics.cycleHistory.slice(-10).map((cycle, i) => {
                const height = Math.max(10, Math.min(100, (cycle.ops / 10) * 100));
                const fail = parseFloat(cycle.failRate);
                const tone = fail < 10 ? "knowmore" : "review";
                return (
                  <Tooltip 
                    key={i} 
                    label={`Cycle: ${cycle.ops} ops, ${cycle.failRate}% fail`}
                    position="top"
                    withArrow
                  >
                    <Box
                      flex={1}
                      h={`${height}%`}
                      style={{
                        cursor: "pointer",
                        ...getSemanticIndicatorStyle(tone, {
                          active: true,
                          shape: "bar",
                          opacity: 0.4,
                        }),
                      }}
                    />
                  </Tooltip>
                );
              })}
            </Group>
          ) : (
            <Center h={rem(60)}>
              <MetaText>Initializing history stream...</MetaText>
            </Center>
          )}

          <Group justify="space-between" mt="auto">
            <MetaText>Last 10 Cycles</MetaText>
            <Group gap={6}>
              <Box
                h={6}
                w={6}
                style={getSemanticIndicatorStyle("knowmore", {
                  active: true,
                  shape: "dot",
                })}
              />
              <MetaText>Success</MetaText>
            </Group>
          </Group>
        </Stack>
        </UnifiedCardBody>
      </UnifiedCard>
    </SimpleGrid>
  );
}
