import type { CSSProperties, MouseEvent } from "react";

export function applySurfaceInteractionHandlers(
  event: MouseEvent<HTMLDivElement>,
  style: CSSProperties,
) {
  Object.assign(event.currentTarget.style, style);
}
