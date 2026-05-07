type ClientInteractionInput = {
  companyId?: string;
  surface: string;
  interactionType: string;
  entityType?: string;
  entityId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  payload?: unknown;
  teachingWeight?: number;
};

export async function logClientInteraction(input: ClientInteractionInput) {
  if (!input.companyId) {
    return;
  }

  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      keepalive: true,
    });
  } catch (error) {
    console.error("[CLIENT_EVENTS] Failed to log interaction:", error);
  }
}
