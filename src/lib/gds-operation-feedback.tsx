'use client';

import { useCallback } from "react";
import { useGdsConfirm, useGdsTelemetry, useGdsToasts } from "@doneisbetter/gds/client";

type RuntimeOperationTelemetry = {
  surface: string;
  action: string;
  targetType?: string;
  targetId?: string | number | null;
};

type RuntimeOperationRequest<T> = RuntimeOperationTelemetry & {
  title: string;
  message: string;
  targetLabel: string;
  destructive?: boolean;
  successTitle?: string;
  successMessage?: string;
  errorTitle?: string;
  run: () => Promise<T>;
};

function safeTelemetryId(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value);
  return text.length <= 16 ? text : `${text.slice(0, 8)}...${text.slice(-4)}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Action failed");
}

export function useGdsRuntimeOperationFeedback() {
  const confirm = useGdsConfirm();
  const toasts = useGdsToasts();
  const telemetry = useGdsTelemetry();

  return useCallback(async <T,>({
    surface,
    action,
    targetType = "runtime-action",
    targetId,
    targetLabel,
    title,
    message,
    destructive = false,
    successTitle = "Action queued",
    successMessage = "The runtime action was accepted.",
    errorTitle = "Action failed",
    run,
  }: RuntimeOperationRequest<T>) => {
    const correlationId = `${surface}:${action}:${Date.now()}`;
    const context = {
      surface,
      action,
      targetType,
      targetId: safeTelemetryId(targetId),
    };

    const confirmed = destructive
      ? await confirm.confirmDestructive({
          title,
          targetName: targetLabel,
          message,
          consequence: "This queues a recovery operation for the local runtime. Backend runtime events remain the source of truth.",
        })
      : await confirm.confirm({
          title,
          targetName: targetLabel,
          message,
          confirmAction: "confirm",
        });

    if (!confirmed) {
      telemetry.emit({
        component: "check.runtime-operation",
        eventType: "cancelled",
        correlationId,
        outcome: "info",
        context,
      });
      return null;
    }

    const startedAt = performance.now();
    telemetry.emit({
      component: "check.runtime-operation",
      eventType: "started",
      correlationId,
      outcome: "info",
      context,
    });

    try {
      const result = await run();
      telemetry.emit({
        component: "check.runtime-operation",
        eventType: "completed",
        correlationId,
        outcome: "success",
        context: {
          ...context,
          durationMs: Math.round(performance.now() - startedAt),
        },
      });
      toasts.notifyActionComplete({
        title: successTitle,
        message: successMessage,
      });
      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      telemetry.emit({
        component: "check.runtime-operation",
        eventType: "failed",
        correlationId,
        outcome: "error",
        context: {
          ...context,
          durationMs: Math.round(performance.now() - startedAt),
        },
      });
      toasts.notifyError({
        title: errorTitle,
        message: errorMessage,
      });
      throw error;
    }
  }, [confirm, telemetry, toasts]);
}
