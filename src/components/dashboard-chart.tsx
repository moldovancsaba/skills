"use client";

import { Line, LineChart, ResponsiveContainer, YAxis, XAxis, Tooltip } from "recharts";
import { useMantineTheme, Box } from "@mantine/core";
import { UnifiedCardSection } from "@/components/ui/unified-card";
import { MetaText } from "@/components/ui/typography";

type ChartData = {
  date: string;
  value: number;
};

type DashboardChartProps = {
  data: ChartData[];
  color?: string;
  height?: number;
};

export function DashboardChart({ data, color, height = 64 }: DashboardChartProps) {
  const theme = useMantineTheme();
  const strokeColor = color || theme.colors.ingress[6];

  if (!data || data.length === 0) return null;

  return (
    <Box h={height} w="100%" opacity={0.6}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <XAxis hide dataKey="date" />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <UnifiedCardSection tone="neutral">
                    <MetaText c="var(--text-primary)">{String(payload[0].value ?? "")}</MetaText>
                  </UnifiedCardSection>
                );
              }
              return null;
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
