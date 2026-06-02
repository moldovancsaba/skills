export function getIceBadgeColor(iceScore: number): string {
  if (iceScore >= 700) return "review";
  if (iceScore >= 500) return "strategy";
  if (iceScore >= 250) return "ingress";
  if (iceScore >= 100) return "checklist";
  return "gray";
}

export function getIceColorClasses(iceScore: number): string {
  return getIceBadgeColor(iceScore);
}

export function getMetricColorClasses(metricTotal: number): string {
  if (metricTotal >= 400) return "review";
  if (metricTotal >= 150) return "strategy";
  if (metricTotal >= 50) return "checklist";
  return "gray";
}
