import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertSystemHealthAction, LocalExecutionLaneError } from "@/lib/local-execution-lanes";

const QUEUE_CONTROL_COMMANDS = new Set([
  "SYNC_PIPELINE_JOBS",
  "ESCALATE_PIPELINE_JOB",
  "RECOVER_FAILED_PIPELINE_JOBS",
  "REFRESH_INTELLIGENCE_SNAPSHOTS",
]);

const SYSTEM_HEALTH_COMMANDS = new Map<string, string>([
  ["SYNC_PIPELINE_JOBS", "QUEUE_TOPOLOGY_REPAIR"],
  ["RECOVER_FAILED_PIPELINE_JOBS", "STALE_JOB_RECOVERY"],
  ["REFRESH_INTELLIGENCE_SNAPSHOTS", "PROJECTION_TRUTH_REPAIR"],
]);

/**
 * System command API for the local worker and guardian control plane.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { command, payload, secret } = body;

    // Simple secret verification (INGEST_SECRET)
    if (secret !== process.env.INGEST_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!command) {
      return NextResponse.json({ error: "Command required" }, { status: 400 });
    }

    if (!QUEUE_CONTROL_COMMANDS.has(command)) {
      return NextResponse.json({ error: "Unsupported command" }, { status: 400 });
    }

    const healthAction = SYSTEM_HEALTH_COMMANDS.get(command);
    if (healthAction) {
      try {
        assertSystemHealthAction({
          action: healthAction,
          humanName: `System command: ${command}`,
          reason: typeof payload?.reason === "string" && payload.reason.trim() ? payload.reason : "Operator requested local system command.",
          requestedBy: "operator",
          mutatesBusinessContent: false,
          timeoutMs: 120000,
        });
      } catch (error) {
        if (error instanceof LocalExecutionLaneError) {
          return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
        }
        throw error;
      }
    }

    const cmd = await prisma.systemCommand.create({
      data: {
        command,
        payload: {
          ...(payload || {}),
          lane: healthAction ? "SYSTEM_HEALTH" : "PLAYLIST",
          healthAction: healthAction || null,
        },
        status: "PENDING"
      }
    });

    return NextResponse.json({ success: true, commandId: cmd.id });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const cmd = await prisma.systemCommand.findUnique({ where: { id } });
    return NextResponse.json(cmd);
  }

  const history = await prisma.systemCommand.findMany({
    orderBy: { issuedAt: "desc" },
    take: 10
  });

  return NextResponse.json(history);
}
