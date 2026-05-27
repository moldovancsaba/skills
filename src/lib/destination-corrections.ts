type JsonLike =
  | null
  | boolean
  | number
  | string
  | JsonLike[]
  | { [key: string]: JsonLike };

function isRecord(value: JsonLike): value is { [key: string]: JsonLike } {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEqual(left: JsonLike, right: JsonLike) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function walkChanges(
  original: JsonLike,
  corrected: JsonLike,
  path: string,
  changes: Array<{ path: string; changeType: "added" | "removed" | "updated" }>,
) {
  if (isEqual(original, corrected)) return;

  if (Array.isArray(original) && Array.isArray(corrected)) {
    const max = Math.max(original.length, corrected.length);
    for (let index = 0; index < max; index += 1) {
      const nextPath = `${path}[${index}]`;
      if (index >= original.length) {
        changes.push({ path: nextPath, changeType: "added" });
        continue;
      }
      if (index >= corrected.length) {
        changes.push({ path: nextPath, changeType: "removed" });
        continue;
      }
      walkChanges(original[index], corrected[index], nextPath, changes);
    }
    return;
  }

  if (isRecord(original) && isRecord(corrected)) {
    const keys = new Set([...Object.keys(original), ...Object.keys(corrected)]);
    for (const key of keys) {
      const nextPath = path ? `${path}.${key}` : key;
      if (!(key in original)) {
        changes.push({ path: nextPath, changeType: "added" });
        continue;
      }
      if (!(key in corrected)) {
        changes.push({ path: nextPath, changeType: "removed" });
        continue;
      }
      walkChanges(original[key], corrected[key], nextPath, changes);
    }
    return;
  }

  changes.push({ path: path || "$", changeType: "updated" });
}

export function summarizeJsonCorrections(
  original: Record<string, unknown>,
  corrected: Record<string, unknown>,
) {
  const changes: Array<{ path: string; changeType: "added" | "removed" | "updated" }> = [];
  walkChanges(original as JsonLike, corrected as JsonLike, "", changes);

  return {
    changed: changes.length > 0,
    changeCount: changes.length,
    changedPaths: changes.map((item) => item.path),
    changeBreakdown: changes.reduce<Record<string, number>>((acc, item) => {
      acc[item.changeType] = (acc[item.changeType] ?? 0) + 1;
      return acc;
    }, {}),
  };
}

export function summarizeDraftCorrections(
  original: Record<string, unknown>,
  corrected: Record<string, unknown>,
) {
  return summarizeJsonCorrections(original, corrected);
}

export function summarizeFactCorrections(
  original: Record<string, unknown>,
  corrected: Record<string, unknown>,
) {
  return summarizeJsonCorrections(original, corrected);
}
