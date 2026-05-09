"use client";

import { Line, LineChart, ResponsiveContainer, YAxis, XAxis, Tooltip } from "recharts";
import { useMantineTheme, Box, Paper, Text } from "@mantine/core";
import { getSemanticInsetStyle } from "@/lib/semantic-theme";

type ChartData = {
  date: string;
  value: number;
};

type DashboardChartProps = {
  data: ChartData[];
  color?: string;
};

export function DashboardChart({ data, color }: DashboardChartProps) {
  const theme = useMantineTheme();
  const strokeColor = color || theme.colors.ingress[6];

  if (!data || data.length === 0) return null;

  return (
    <Box h={64} w="100%" style={{ opacity: 0.6 }}>
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
                  <Paper
                    p={4}
                    style={getSemanticInsetStyle("neutral")}
                  >
                    <Text size="xs" >{payload[0].value}</Text>
                  </Paper>
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
