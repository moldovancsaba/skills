export function getIceColorClasses(iceScore: number): string {
  if (iceScore <= 50) return "text-[hsl(var(--color-low))] bg-[hsl(var(--color-low)/0.1)] border-[hsl(var(--color-low)/0.2)]";
  if (iceScore <= 125) return "text-[hsl(var(--color-medium))] bg-[hsl(var(--color-medium)/0.1)] border-[hsl(var(--color-medium)/0.2)]";
  if (iceScore <= 250) return "text-[hsl(var(--color-medium))] bg-[hsl(var(--color-medium)/0.1)] border-[hsl(var(--color-medium)/0.2)]";
  if (iceScore <= 500) return "text-[hsl(var(--color-execution))] bg-[hsl(var(--color-execution)/0.1)] border-[hsl(var(--color-execution)/0.2)]";
  return "text-[hsl(var(--color-high))] bg-[hsl(var(--color-high)/0.1)] border-[hsl(var(--color-high)/0.2)]";
}

export function getMetricColorClasses(metricTotal: number): string {
  if (metricTotal <= 50) return "text-[hsl(var(--color-low))] bg-[hsl(var(--color-low)/0.1)] border-[hsl(var(--color-low)/0.2)]";
  if (metricTotal <= 150) return "text-[hsl(var(--color-medium))] bg-[hsl(var(--color-medium)/0.1)] border-[hsl(var(--color-medium)/0.2)]";
  if (metricTotal <= 400) return "text-[hsl(var(--color-execution))] bg-[hsl(var(--color-execution)/0.1)] border-[hsl(var(--color-execution)/0.2)]";
  return "text-[hsl(var(--color-high))] bg-[hsl(var(--color-high)/0.1)] border-[hsl(var(--color-high)/0.2)]";
}
