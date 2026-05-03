import { NextRequest, NextResponse } from "next/server";

/**
 * Validates the Authorization header against the INGEST_SECRET.
 * Used for programmatic ingress from external systems.
 */
export async function verifyIngestSecret(request: NextRequest) {
  const secret = process.env.INGEST_SECRET;
  
  if (!secret) {
    console.error("[AUTH] INGEST_SECRET not configured in .env");
    return { error: NextResponse.json({ error: "Ingestion service misconfigured" }, { status: 500 }) };
  }

  const authHeader = request.headers.get("Authorization");
  
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { error: NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 }) };
  }

  const token = authHeader.split(" ")[1];

  if (token !== secret) {
    return { error: NextResponse.json({ error: "Invalid ingestion secret" }, { status: 403 }) };
  }

  return { success: true };
}
