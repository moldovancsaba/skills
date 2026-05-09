export type UIStateTone = "info" | "success" | "warning" | "danger" | "muted";

export function resolveStateTone(state: UIStateTone) {
  switch (state) {
    case "success":
      return "knowmore";
    case "warning":
      return "review";
    case "danger":
      return "review";
    case "muted":
      return "neutral";
    case "info":
    default:
      return "ingress";
  }
}

export function resolveStateTextColor(state: UIStateTone) {
  switch (state) {
    case "success":
      return "knowmore";
    case "warning":
      return "review";
    case "danger":
      return "review";
    case "muted":
    default:
      return "dimmed";
  }
}
