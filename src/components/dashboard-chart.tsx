"use client";

import dynamic from "next/dynamic";
import { Box } from "@mantine/core";
import { useEffect, useRef, useState } from "react";

type ChartData = {
  date: string;
  value: number;
};

type DashboardChartProps = {
  data: ChartData[];
  color?: string;
  height?: number;
};

const DashboardChartRenderer = dynamic(() => import("./dashboard-chart-renderer"), {
  ssr: false,
});

export function DashboardChart({ data, color, height = 64 }: DashboardChartProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    if (!data || data.length === 0) return;
    if (shouldRender) return;

    const node = hostRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting || entry.intersectionRatio > 0)) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "240px 0px",
        threshold: 0.01,
      },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [data, shouldRender]);

  if (!data || data.length === 0) return null;

  return (
    <Box ref={hostRef} h={height} w="100%" opacity={0.6}>
      {shouldRender ? (
        <DashboardChartRenderer data={data} color={color} height={height} />
      ) : null}
    </Box>
  );
}
