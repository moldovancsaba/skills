/**
 * TRINITY FEEDBACK HANDLER
 * M3.2 — Typed Decline Classification & Rework Routing
 * M3.3 — DELIVER Signal & Downstream Reward Propagation
 * v1.0.0
 *
 * Implements the FeedbackEvent processing layer from Trinity §19–§21.
 *
 * Decline classes per spec §20:
 *   WRONG, DUPLICATE, TOO_VAGUE, LOW_PRIORITY, BAD_TIMING,
 *   NOT_ACTIONABLE, MISSING_CONTEXT, IRRELEVANT, ALREADY_DONE, IGNORANT_OUTPUT
 *
 * Rework routing per decline class:
 *   TOO_VAGUE / MISSING_CONTEXT  → REWORK / ENRICH
 *   NOT_ACTIONABLE               → REWORK / REVISE
 *   DUPLICATE                    → SUPPRESSED + duplicate cluster link
 *   BAD_TIMING / LOW_PRIORITY    → DOWNRANK_ONLY
 *   WRONG / IRRELEVANT / ALREADY_DONE / IGNORANT_OUTPUT → ARCHIVED
 *
 * DELIVER is a distinct, stronger signal than ACCEPT (§21):
 *   - Transitions item to DELIVERED state
 *   - Propagates reward to source knowledge lineage
 *   - Delivery comment is flagged as high-value memory input
 */

const { CandidateState, ReworkRoute, toRework, toSuppressed, toArchived, toDelivered } = require("./lifecycle");
const { triggerFrontierRecompute } = require("./frontier");

// ---------------------------------------------------------------------------
// 1. Decline Routing Map
// ---------------------------------------------------------------------------

// Maps DeclineClass → { candidateState, reworkRoute? }
const DECLINE_ROUTING = {
  TOO_VAGUE:       { candidateState: CandidateState.REWORK,     reworkRoute: ReworkRoute.ENRICH },
  MISSING_CONTEXT: { candidateState: CandidateState.REWORK,     reworkRoute: ReworkRoute.ENRICH },
  NOT_ACTIONABLE:  { candidateState: CandidateState.REWORK,     reworkRoute: ReworkRoute.REVISE },
  DUPLICATE:       { candidateState: CandidateState.SUPPRESSED,  reworkRoute: null },
  BAD_TIMING:      { candidateState: null, /* DOWNRANK_ONLY */   reworkRoute: ReworkRoute.DOWNRANK_ONLY },
  LOW_PRIORITY:    { candidateState: null, /* DOWNRANK_ONLY */   reworkRoute: ReworkRoute.DOWNRANK_ONLY },
  WRONG:           { candidateState: CandidateState.ARCHIVED,   reworkRoute: null },
  IRRELEVANT:      { candidateState: CandidateState.ARCHIVED,   reworkRoute: null },
  ALREADY_DONE:    { candidateState: CandidateState.ARCHIVED,   reworkRoute: null },
  IGNORANT_OUTPUT: { candidateState: CandidateState.ARCHIVED,   reworkRoute: null },
};

// ---------------------------------------------------------------------------
// 2. Decline Handler (M3.2)
// ---------------------------------------------------------------------------

/**
 * Processes a DECLINE feedback event with typed classification.
 * Routes the item to the correct next state, persists an immutable DeclineEvent,
 * and adjusts feedbackScore.
 *
 * @param {PrismaClient} prisma
 * @param {object} feedbackRecord - Feedback record from DB
 * @param {object} item - NBAItem record
 */
async function handleDecline(prisma, feedbackRecord, item) {
  const declineClass = feedbackRecord.declineClass || "WRONG";
  const routing = DECLINE_ROUTING[declineClass] || DECLINE_ROUTING.WRONG;

  // Persist immutable DeclineEvent
  await prisma.declineEvent.create({
    data: {
      nbaItemId: item.id,
      companyId: item.companyId,
      declineClass,
      comment: feedbackRecord.annotation || null,
      actorId: feedbackRecord.actorId || null,
      reworkRoute: routing.reworkRoute || null,
    },
  });

  // Compute new feedbackScore (accumulated negative signal)
  const newFeedbackScore = (item.feedbackScore || 0) - 1;

  let stateUpdate;

  if (routing.reworkRoute === ReworkRoute.DOWNRANK_ONLY) {
    // BAD_TIMING / LOW_PRIORITY: keep in pool, just lower score
    stateUpdate = {
      feedbackScore: newFeedbackScore,
      reworkRoute: ReworkRoute.DOWNRANK_ONLY,
      evaluationReason: `DECLINE(${declineClass}): Downranked only — not archived`,
    };
    console.log(`[FEEDBACK] ${item.companyId} tc:${item.id} DOWNRANK(${declineClass})`);

  } else if (routing.candidateState === CandidateState.SUPPRESSED) {
    // DUPLICATE
    stateUpdate = {
      ...toSuppressed(`DECLINE(${declineClass}): Suppressed as duplicate`),
      feedbackScore: newFeedbackScore,
      processingStatus: "DECLINED",
      status: "DECLINED",
    };
    console.log(`[FEEDBACK] ${item.companyId} tc:${item.id} SUPPRESSED(${declineClass})`);

  } else if (routing.candidateState === CandidateState.REWORK) {
    // TOO_VAGUE / MISSING_CONTEXT / NOT_ACTIONABLE → rework
    stateUpdate = {
      ...toRework(routing.reworkRoute, `DECLINE(${declineClass}): Queued for rework`),
      feedbackScore: newFeedbackScore,
      processingStatus: "DRAFT",
    };
    console.log(`[FEEDBACK] ${item.companyId} tc:${item.id} REWORK(${declineClass} → ${routing.reworkRoute})`);

  } else {
    // ARCHIVED: WRONG / IRRELEVANT / ALREADY_DONE / IGNORANT_OUTPUT
    stateUpdate = {
      ...toArchived(`DECLINE(${declineClass}): Permanently archived`),
      feedbackScore: newFeedbackScore,
      processingStatus: "DECLINED",
      status: "DECLINED",
    };
    console.log(`[FEEDBACK] ${item.companyId} tc:${item.id} ARCHIVED(${declineClass})`);
  }

  await prisma.nBAItem.update({
    where: { id: item.id },
    data: stateUpdate,
  });
}

// ---------------------------------------------------------------------------
// 3. DELIVER Handler (M3.3)
// ---------------------------------------------------------------------------

/**
 * Processes a DELIVER feedback event — the strongest positive signal.
 * Transitions item to DELIVERED, propagates reward through lineage,
 * and flags delivery comment as high-value memory input.
 *
 * @param {PrismaClient} prisma
 * @param {object} feedbackRecord
 * @param {object} item
 */
async function handleDeliver(prisma, feedbackRecord, item) {
  // Transition item to DELIVERED state
  await prisma.nBAItem.update({
    where: { id: item.id },
    data: {
      ...toDelivered(),
      feedbackScore: (item.feedbackScore || 0) + 5, // DELIVER is 5× stronger than ACCEPT
      evaluationReason: "DELIVERED: Action confirmed executed in reality",
    },
  });

  console.log(`[FEEDBACK] ${item.companyId} tc:${item.id} DELIVERED`);

  // Propagate reward to source KnowledgeItem lineage
  const sourceIds = [
    ...(item.generatedFromIds || []),
    ...(item.sourceFlashcardIds || []),
  ].filter(Boolean);

  if (sourceIds.length > 0) {
    for (const fcId of sourceIds) {
      try {
        const fc = await prisma.flashcard.findUnique({ where: { id: fcId } });
        if (!fc) continue;
        await prisma.flashcard.update({
          where: { id: fcId },
          data: {
            confidence: Math.min(10, (fc.confidence || 5) + 2),
            confidenceScore: Math.min(10, (fc.confidenceScore || 5) + 2),
            feedbackConfidenceDelta: (fc.feedbackConfidenceDelta || 0) + 2,
            updatedAt: new Date(),
          },
        });
        console.log(`[FEEDBACK] Delivered reward propagated to fc:${fcId}`);
      } catch (e) {
        // Non-fatal — lineage reward is best-effort
      }
    }
  }

  // Flag delivery comment as high-value memory input (will be processed by M4.1)
  if (feedbackRecord.deliveryComment || feedbackRecord.annotation) {
    await prisma.feedback.update({
      where: { id: feedbackRecord.id },
      data: {
        annotation: feedbackRecord.deliveryComment || feedbackRecord.annotation,
        // Mark as high-value for memory processing (using annotation prefix convention)
        modifiedTitle: "[DELIVER_COMMENT]",
      },
    });
  }
}

// ---------------------------------------------------------------------------
// 4. ACCEPT Handler
// ---------------------------------------------------------------------------

async function handleAccept(prisma, feedbackRecord, item) {
  const newFeedbackScore = (item.feedbackScore || 0) + 1;
  await prisma.nBAItem.update({
    where: { id: item.id },
    data: {
      feedbackScore: newFeedbackScore,
      status: "ACCEPTED",
    },
  });
  console.log(`[FEEDBACK] ${item.companyId} tc:${item.id} ACCEPTED`);
}

// ---------------------------------------------------------------------------
// 5. Main Entry Point — dispatches to typed handlers
// ---------------------------------------------------------------------------

/**
 * Processes all unprocessed feedback events for a company using typed handlers.
 * This replaces the simple feedback loop in maintenance.js processUserFeedback.
 *
 * @param {PrismaClient} prisma
 * @param {object} company
 * @returns {number} count of processed events
 */
async function processFeedbackEvents(prisma, company) {
  const pending = await prisma.feedback.findMany({
    where: {
      nbaItem: { companyId: company.id },
      processedByWorkerAt: null,
    },
    include: { nbaItem: true },
    orderBy: { createdAt: "asc" },
  });

  if (pending.length === 0) return 0;

  console.log(`[FEEDBACK] ${company.name}: Processing ${pending.length} feedback events...`);

  for (const f of pending) {
    const item = f.nbaItem;
    try {
      if (f.action === "DECLINE") {
        await handleDecline(prisma, f, item);
      } else if (f.action === "DELIVER") {
        await handleDeliver(prisma, f, item);
      } else if (f.action === "ACCEPT" || f.action === "MODIFY_ACCEPT") {
        await handleAccept(prisma, f, item);
        // MODIFY_ACCEPT: also apply user edits
        if (f.action === "MODIFY_ACCEPT" && (f.modifiedTitle || f.modifiedDescription)) {
          await prisma.nBAItem.update({
            where: { id: item.id },
            data: {
              title: f.modifiedTitle || item.title,
              description: f.modifiedDescription || item.description,
            },
          });
        }
      }

      // Mark feedback as processed
      await prisma.feedback.update({
        where: { id: f.id },
        data: {
          processedByWorkerAt: new Date(),
          iceImpact: f.action === "DECLINE" ? -1 : f.action === "DELIVER" ? 5 : 1,
        },
      });
    } catch (e) {
      console.error(`[FEEDBACK] Failed event ${f.id}:`, e.message);
    }
  }

  // Recompute frontier after all feedback is processed
  try {
    await triggerFrontierRecompute(prisma, company.id);
  } catch (e) {
    console.warn(`[FEEDBACK] Frontier recompute failed: ${e.message}`);
  }

  return pending.length;
}

module.exports = {
  processFeedbackEvents,
  handleDecline,
  handleDeliver,
  handleAccept,
  DECLINE_ROUTING,
};
