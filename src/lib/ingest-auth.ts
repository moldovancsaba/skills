import { NextRequest, NextResponse } from "next/server";

function readBearerToken(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.split(" ")[1] ?? null;
}

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

  const token = readBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 }) };
  }

  if (token !== secret) {
    return { error: NextResponse.json({ error: "Invalid ingestion secret" }, { status: 403 }) };
  }

  return { success: true };
}

/**
 * Validates a cron/background bearer secret. Prefer CRON_SECRET when configured,
 * and fall back to INGEST_SECRET so the daemon can still be exercised locally.
 */
export async function verifyBackgroundJobSecret(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim() || process.env.INGEST_SECRET?.trim();
  if (!secret) {
    console.error("[AUTH] CRON_SECRET or INGEST_SECRET must be configured for background jobs");
    return { error: NextResponse.json({ error: "Background job authentication misconfigured" }, { status: 500 }) };
  }

  const token = readBearerToken(request);
  if (!token) {
    return { error: NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 }) };
  }

  if (token !== secret) {
    return { error: NextResponse.json({ error: "Invalid background job secret" }, { status: 403 }) };
  }

  return { success: true };
}
