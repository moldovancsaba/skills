export function getIceColorClasses(iceScore: number): string {
  if (iceScore <= 50) return "text-red-400 bg-red-500/10 border-red-500/20";
  if (iceScore <= 125) return "text-orange-400 bg-orange-500/10 border-orange-500/20";
  if (iceScore <= 250) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  if (iceScore <= 500) return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  return "text-green-400 bg-green-500/10 border-green-500/20";
}

export function getMetricColorClasses(metricTotal: number): string {
  // Equivalent 1-10 mapping (e.g. Impact + Confidence = 2 to 20 range)
  // Scaling bounds proportionally to max 1000
  // Instead of an ICE product, just map a simple 1-10 scale
  if (metricTotal <= 1) return "text-red-400 bg-red-500/10 border-red-500/20";
  if (metricTotal <= 3) return "text-orange-400 bg-orange-500/10 border-orange-500/20";
  if (metricTotal <= 5) return "text-yellow-400 bg-yellow-500/10 border-yellow-500/20";
  if (metricTotal <= 7) return "text-blue-400 bg-blue-500/10 border-blue-500/20";
  return "text-green-400 bg-green-500/10 border-green-500/20";
}
