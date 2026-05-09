export function buildCardShareUrl(cardId: string): string {
  if (typeof window === "undefined") {
    return `/card/${cardId}`;
  }

  return new URL(`/card/${cardId}`, window.location.origin).toString();
}
