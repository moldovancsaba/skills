"use client";

import { Line, LineChart, ResponsiveContainer, YAxis, XAxis, Tooltip } from "recharts";
import { useMantineTheme, Box, Paper, Text } from "@mantine/core";

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
  const strokeColor = color || theme.colors.brand[6];

  if (!data || data.length === 0) return null;

  return (
    <Box h={64} w="100%" style={{ opacity: 0.6, transition: "opacity 0.3s ease" }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={strokeColor}
            strokeWidth={2}
            dot={false}
            animationDuration={1500}
          />
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <XAxis hide dataKey="date" />
          <Tooltip 
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                return (
                  <Paper 
                    p={4} 
                    radius="xs" 
                    withBorder 
                    style={{ 
                      backgroundColor: "rgba(0,0,0,0.8)"
                    }}
                  >
                    <Text size="xs" fw={700}>{payload[0].value}</Text>
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
