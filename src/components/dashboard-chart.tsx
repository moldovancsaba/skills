"use client";

import { Line, LineChart, ResponsiveContainer, YAxis, XAxis, Tooltip } from "recharts";

type ChartData = {
  date: string;
  value: number;
};

type DashboardChartProps = {
  data: ChartData[];
  color?: string;
};

export function DashboardChart({ data, color = "#8884d8" }: DashboardChartProps) {
  if (!data || data.length === 0) return null;

  return (
    <div className="h-16 w-full opacity-50 group-hover:opacity-100 transition-opacity duration-500">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
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
                  <div className="rounded-md bg-zinc-900/90 border border-white/10 px-2 py-1 text-[10px] font-bold text-white shadow-xl backdrop-blur-sm">
                    {payload[0].value}
                  </div>
                );
              }
              return null;
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
