'use client';

import { useCallback, useMemo, useState } from "react";
import { Badge, Group, Stack } from "@mantine/core";
import { SharedBoard } from "@/components/board/shared-board";
import { OpportunityReviewCard, type Opportunitycard, type OpportunitycardActionMode } from "@/components/opportunity-review-card";
import { UnifiedCardBody } from "@/components/ui/unified-card";
import { UnifiedCardModal } from "@/components/ui/unified-card-modal";
import { Text } from "@/components/ui/typography";
import { getOpportunityLaneMeta, OPPORTUNITY_BOARD_COLUMN_ORDER, type OpportunityKanbanColumn } from "@/lib/opportunity-ui";

export type SalesOpportunitycard = Opportunitycard & {
  sortOrder?: number | null;
};

type SalesBoardReorderPayload = {
  itemId: string;
  nextItems: SalesOpportunitycard[];
  sourceColumn: OpportunityKanbanColumn;
  destinationColumn: OpportunityKanbanColumn;
  beforeId: string | null;
  afterId: string | null;
};

type Props = {
  items: SalesOpportunitycard[];
  onAction: (itemId: string, action: string, payload?: Record<string, unknown>) => Promise<void> | void;
  onReorder: (payload: SalesBoardReorderPayload) => void | Promise<void>;
};

type DraftState = {
  companyName: string;
  title: string;
  body: string;
  website: string;
  location: string;
  coreOffer: string;
  fitRationale: string;
};

function createDraft(item: SalesOpportunitycard): DraftState {
  return {
    companyName: item.companyName,
    title: item.title,
    body: item.body,
    website: item.website || "",
    location: item.location || "",
    coreOffer: item.coreOffer || "",
    fitRationale: item.fitRationale || "",
  };
}

export function SalesBoard({ items, onAction, onReorder }: Props) {
  const [detailId, setDetailId] = useState<string | null>(null);
  const [actionCardId, setActionCardId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<OpportunitycardActionMode | null>(null);
  const [annotation, setAnnotation] = useState("");
  const [declineReason, setDeclineReason] = useState("BAD_FIT");
  const [draft, setDraft] = useState<DraftState>({
    companyName: "",
    title: "",
    body: "",
    website: "",
    location: "",
    coreOffer: "",
    fitRationale: "",
  });
  const [busyActionId, setBusyActionId] = useState<string | null>(null);

  const boardItems = useMemo(
    () => items
      .filter((item) => item.activityState !== "ARCHIVED")
      .map((item) => ({
        ...item,
        columnKey: item.kanbanColumn,
        orderRank: Number(item.sortOrder ?? 0),
      })),
    [items],
  );

  const detailItem = useMemo(
    () => (detailId ? items.find((item) => item.id === detailId) || null : null),
    [detailId, items],
  );

  const resetActionState = useCallback(() => {
    setActionCardId(null);
    setActionMode(null);
    setAnnotation("");
    setDeclineReason("BAD_FIT");
  }, []);

  const openAction = useCallback((item: SalesOpportunitycard, mode: OpportunitycardActionMode) => {
    setActionCardId(item.id);
    setActionMode(mode);
    setAnnotation("");
    setDeclineReason("BAD_FIT");
    setDraft(createDraft(item));
  }, []);

  const handleSubmit = useCallback(async (itemId: string, mode: OpportunitycardActionMode) => {
    setBusyActionId(itemId);
    try {
      if (mode === "DECLINE") {
        await onAction(itemId, "DECLINE", { declineReason, annotation });
      } else if (mode === "MODIFY") {
        await onAction(itemId, "MODIFY", { ...draft, annotation });
      } else if (mode === "PIN" || mode === "REQUEST_REFRESH" || mode === "ARCHIVE") {
        await onAction(itemId, mode, { annotation });
      } else {
        await onAction(itemId, "ACCEPT", { annotation });
      }
      resetActionState();
      if ((mode === "DECLINE" || mode === "ARCHIVE") && detailId === itemId) {
        setDetailId(null);
      }
    } finally {
      setBusyActionId(null);
    }
  }, [annotation, declineReason, detailId, draft, onAction, resetActionState]);

  return (
    <>
      <UnifiedCardModal
        opened={Boolean(detailItem)}
        onClose={() => {
          setDetailId(null);
          resetActionState();
        }}
        tone={detailItem ? getOpportunityLaneMeta(detailItem.kanbanColumn).tone : "neutral"}
        title={detailItem?.companyName || "Opportunitycard"}
        subtitle={detailItem ? `#${detailItem.opportunityType} · ${detailItem.kanbanColumn}` : undefined}
        badge={detailItem ? `ICE ${Math.round(detailItem.iceScore)}` : undefined}
        size="xl"
      >
        {detailItem ? (
          <OpportunityReviewCard
            item={detailItem}
            detailMode
            isActionOpen={actionCardId === detailItem.id}
            actionMode={actionCardId === detailItem.id ? actionMode : null}
            isBusy={busyActionId === detailItem.id}
            annotation={annotation}
            declineReason={declineReason}
            draft={draft}
            onOpenAction={openAction}
            onCloseAction={resetActionState}
            onAnnotationChange={setAnnotation}
            onDeclineReasonChange={setDeclineReason}
            onDraftChange={(field, value) => setDraft((current) => ({ ...current, [field]: value }))}
            onSubmit={handleSubmit}
          />
        ) : null}
      </UnifiedCardModal>

      <SharedBoard
        columns={OPPORTUNITY_BOARD_COLUMN_ORDER.map((key) => getOpportunityLaneMeta(key))}
        items={boardItems}
        onMove={async (request, nextItems) => {
          await onReorder({
            itemId: request.itemId,
            nextItems: nextItems as SalesOpportunitycard[],
            sourceColumn: request.sourceColumn as OpportunityKanbanColumn,
            destinationColumn: request.destinationColumn as OpportunityKanbanColumn,
            beforeId: request.beforeId,
            afterId: request.afterId,
          });
        }}
        getCardTone={(item) => getOpportunityLaneMeta(item.kanbanColumn).tone}
        renderCard={(item) => (
          <UnifiedCardBody>
            <Stack gap="xs" onClick={() => setDetailId(item.id)}>
              <Text size="xs" lineClamp={2}>{item.companyName}</Text>
              <Text size="xs" c="dimmed" lineClamp={2}>{item.title}</Text>
              <Group justify="space-between" wrap="nowrap">
                <Badge size="xs" variant="light" color={item.processingStatus === "ACCEPTED" ? "checklist" : "strategy"}>
                  {item.opportunityType}
                </Badge>
                <Text size="xs" c="strategy" style={{ fontVariantNumeric: "tabular-nums" }}>
                  ICE {Math.round(item.iceScore)}
                </Text>
              </Group>
            </Stack>
          </UnifiedCardBody>
        )}
      />
    </>
  );
}
