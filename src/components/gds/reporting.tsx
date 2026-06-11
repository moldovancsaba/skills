'use client';

import {
  GdsChart,
  ReportingSection,
  validateGdsChartData,
  type GdsChartConfig,
  type GdsChartDatum,
  type GdsChartRendererContext,
  type GdsChartType,
  type ReportingSectionProps,
} from "@doneisbetter/gds/client";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/components/gds/charts";
import { SEMANTIC_CHART_BAR_RADIUS_COMPACT, SEMANTIC_CHART_COLORS, SEMANTIC_CHART_GRID_STROKE } from "@/lib/semantic-theme";

export type GdsReportingBarChartProps = {
  title: string;
  summary: string;
  data: GdsChartDatum[];
  type?: Extract<GdsChartType, "bar" | "stacked-bar">;
  config?: GdsChartConfig;
};

export function GdsReportingSection(props: ReportingSectionProps) {
  return <ReportingSection {...props} />;
}

function buildBarRows(data: GdsChartDatum[]) {
  const groups = Array.from(new Set(data.map((point) => point.group).filter((group): group is string => Boolean(group))));
  if (!groups.length) {
    return {
      groups: ["value"],
      rows: data.map((point) => ({
        label: point.label,
        value: point.value ?? 0,
      })),
    };
  }

  const rowsByLabel = new Map<string, Record<string, string | number>>();
  for (const point of data) {
    const row = rowsByLabel.get(point.label) ?? { label: point.label };
    row[point.group ?? "value"] = point.value ?? 0;
    rowsByLabel.set(point.label, row);
  }

  return {
    groups,
    rows: Array.from(rowsByLabel.values()),
  };
}

function GdsRechartsBarRenderer({ data, type, labelledBy, describedBy }: GdsChartRendererContext) {
  const { groups, rows } = buildBarRows(data);
  const isStacked = type === "stacked-bar";

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart
        data={rows}
        role="img"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        <CartesianGrid strokeDasharray="3 3" stroke={SEMANTIC_CHART_GRID_STROKE} />
        <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} />
        <YAxis allowDecimals={false} />
        <Tooltip />
        {groups.length > 1 ? <Legend /> : null}
        {groups.map((group, index) => (
          <Bar
            key={group}
            dataKey={group}
            name={group === "value" ? undefined : group}
            stackId={isStacked ? "gds-stack" : undefined}
            fill={SEMANTIC_CHART_COLORS[Object.keys(SEMANTIC_CHART_COLORS)[index % Object.keys(SEMANTIC_CHART_COLORS).length] as keyof typeof SEMANTIC_CHART_COLORS]}
            radius={SEMANTIC_CHART_BAR_RADIUS_COMPACT}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function GdsReportingBarChart({
  title,
  summary,
  data,
  type = "bar",
  config,
}: GdsReportingBarChartProps) {
  const validation = validateGdsChartData(type, data, config);

  return (
    <GdsChart
      type={type}
      title={title}
      summary={summary}
      data={data}
      config={config}
      state={validation.state}
      renderer={GdsRechartsBarRenderer}
    />
  );
}
