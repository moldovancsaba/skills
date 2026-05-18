import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const POSITIVE_TASK_ACTIONS = new Set(["DELIVER", "MODIFY_ACCEPT", "ACCEPT"]);
const STRONG_TASK_ACTIONS = new Set(["DELIVER", "MODIFY_ACCEPT"]);
const POSITIVE_FLASHCARD_ACTIONS = new Set(["ACCEPT", "MODIFY_ACCEPT"]);
const NEGATIVE_FLASHCARD_ACTIONS = new Set(["DECLINE", "REJECT"]);

function parseArgs(argv) {
  const args = { company: null, out: null };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--company") {
      args.company = argv[index + 1] ?? null;
      index += 1;
    } else if (token === "--out") {
      args.out = argv[index + 1] ?? null;
      index += 1;
    }
  }
  return args;
}

function isoStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

function compactText(value, max = 900) {
  if (!value) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, max);
}

function tokenize(value) {
  return compactText(value, 400)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((token) => token.length >= 3);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function hasSubstantiveText(value, min = 24) {
  return compactText(value).length >= min;
}

function jsonLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function taskOutput(task, feedback, strategicFeedback = null) {
  return JSON.stringify(
    {
      title: strategicFeedback?.modifiedTitle || feedback?.modifiedTitle || task.title,
      description: compactText(
        strategicFeedback?.modifiedDescription ||
          feedback?.modifiedDescription ||
          task.description ||
          "",
        1200,
      ),
      impact: task.impact,
      confidence: task.confidence,
      ease: task.ease,
      rationale: compactText(
        strategicFeedback?.annotation ||
          feedback?.deliveryComment ||
          feedback?.annotation ||
          task.userAnnotation ||
          "Operator-validated checklist task.",
        800,
      ),
    },
    null,
    0,
  );
}

function flashcardOutput(card, action, correction = null, strategicFeedback = null) {
  return JSON.stringify(
    {
      title: strategicFeedback?.modifiedTitle || action?.modifiedTitle || card.title,
      body: compactText(
        strategicFeedback?.modifiedDescription ||
          action?.modifiedBody ||
          card.body ||
          "",
        1400,
      ),
      kind: card.kind,
      impact: card.impact,
      confidence: card.confidence,
      weight: card.weight,
      rationale: compactText(
        strategicFeedback?.annotation ||
          correction?.note ||
          action?.annotation ||
          card.userAnnotation ||
          "Operator-validated knowledge card.",
        700,
      ),
    },
    null,
    0,
  );
}

function buildTaskInput(company, task, feedback, flashcards, strategicFeedback = null) {
  const evidence = flashcards
    .slice(0, 3)
    .map((flashcard) => `- ${compactText(flashcard.title, 120)}: ${compactText(flashcard.body, 220)}`)
    .join("\n");

  return [
    `Company: ${company.name}`,
    `Industry: ${compactText(company.industry || company.targetMarket || "Unknown", 140)}`,
    company.description ? `Description: ${compactText(company.description, 260)}` : null,
    `Existing task candidate: ${compactText(task.title, 180)}`,
    task.description ? `Existing description: ${compactText(task.description, 500)}` : null,
    feedback?.annotation ? `Operator signal: ${compactText(feedback.annotation, 500)}` : null,
    feedback?.deliveryComment ? `Delivery note: ${compactText(feedback.deliveryComment, 500)}` : null,
    strategicFeedback?.annotation ? `Strategic feedback: ${compactText(strategicFeedback.annotation, 500)}` : null,
    evidence ? `Supporting knowledge:\n${evidence}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildTaskHardInput(company, task, feedback, flashcards, strategicFeedback = null) {
  const evidence = flashcards
    .slice(0, 5)
    .map((flashcard) => `- ${compactText(flashcard.title, 120)}: ${compactText(flashcard.body, 220)}`)
    .join("\n");

  return [
    `Company: ${company.name}`,
    `Industry: ${compactText(company.industry || company.targetMarket || "Unknown", 140)}`,
    company.description ? `Description: ${compactText(company.description, 260)}` : null,
    "Write the strongest next checklist task as JSON using company context, operator feedback, and supporting knowledge.",
    feedback?.annotation ? `Operator signal: ${compactText(feedback.annotation, 700)}` : null,
    feedback?.deliveryComment ? `Delivery note: ${compactText(feedback.deliveryComment, 700)}` : null,
    strategicFeedback?.annotation ? `Strategic feedback: ${compactText(strategicFeedback.annotation, 700)}` : null,
    evidence ? `Supporting knowledge:\n${evidence}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFlashcardInput(company, card, strategicFeedback = null) {
  const sourceSummary = (card.sources || [])
    .slice(0, 3)
    .map((source) => `- ${source.sourceType}: ${compactText(source.sourceName || source.sourceId, 160)}`)
    .join("\n");

  return [
    `Company: ${company.name}`,
    `Industry: ${compactText(company.industry || company.targetMarket || "Unknown", 140)}`,
    company.description ? `Description: ${compactText(company.description, 260)}` : null,
    `Knowledge kind: ${card.kind}`,
    sourceSummary ? `Source summary:\n${sourceSummary}` : null,
    strategicFeedback?.annotation ? `Strategic feedback: ${compactText(strategicFeedback.annotation, 400)}` : null,
    card.userAnnotation ? `Operator annotation: ${compactText(card.userAnnotation, 400)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFlashcardHardInput(company, card, action, correction, strategicFeedback = null) {
  const sourceSummary = (card.sources || [])
    .slice(0, 5)
    .map((source) => `- ${source.sourceType}: ${compactText(source.sourceName || source.sourceId, 160)}`)
    .join("\n");

  return [
    `Company: ${company.name}`,
    `Industry: ${compactText(company.industry || company.targetMarket || "Unknown", 140)}`,
    company.description ? `Description: ${compactText(company.description, 260)}` : null,
    `Knowledge kind: ${card.kind}`,
    "Write the strongest knowledge flashcard as JSON using source evidence and operator guidance.",
    action?.annotation ? `Operator action note: ${compactText(action.annotation, 500)}` : null,
    correction?.note ? `Correction note: ${compactText(correction.note, 500)}` : null,
    correction?.correctionType ? `Correction type: ${correction.correctionType}` : null,
    strategicFeedback?.annotation ? `Strategic feedback: ${compactText(strategicFeedback.annotation, 500)}` : null,
    sourceSummary ? `Source summary:\n${sourceSummary}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function pairPrompt(company, kind) {
  return [
    `Company: ${company.name}`,
    `Industry: ${compactText(company.industry || company.targetMarket || "Unknown", 140)}`,
    company.description ? `Description: ${compactText(company.description, 260)}` : null,
    `Choose the better ${kind} candidate for this company and explain why.`,
  ]
    .filter(Boolean)
    .join("\n");
}

function taskIsHighSignal(feedback, supportingFlashcards, strategicFeedback = null) {
  if (strategicFeedback?.action === "MODIFY_ACCEPT" || strategicFeedback?.action === "DELIVER") return true;
  if (!feedback?.action || !POSITIVE_TASK_ACTIONS.has(feedback.action)) return false;
  if (STRONG_TASK_ACTIONS.has(feedback.action)) return true;
  return (
    hasSubstantiveText(feedback.annotation) ||
    hasSubstantiveText(feedback.deliveryComment) ||
    hasSubstantiveText(feedback.modifiedDescription) ||
    hasSubstantiveText(strategicFeedback?.annotation) ||
    supportingFlashcards.length > 1
  );
}

function taskIsStrongNegative(feedback, strategicFeedback = null) {
  if (strategicFeedback?.action === "DECLINE" && hasSubstantiveText(strategicFeedback.annotation, 18)) return true;
  return feedback?.action === "DECLINE" && hasSubstantiveText(feedback.annotation, 18);
}

function flashcardIsHighSignal(action, correction, strategicFeedback = null) {
  if (strategicFeedback?.action === "MODIFY_ACCEPT") return true;
  if (!action?.action || !POSITIVE_FLASHCARD_ACTIONS.has(action.action)) return false;
  if (action.action === "MODIFY_ACCEPT") return true;
  if (correction && ["PIN", "REQUEST_REFRESH"].includes(correction.correctionType)) return true;
  return hasSubstantiveText(action.annotation) || hasSubstantiveText(correction?.note) || hasSubstantiveText(strategicFeedback?.annotation);
}

function flashcardIsStrongNegative(action, correction, strategicFeedback = null) {
  if (strategicFeedback?.action === "DECLINE" && hasSubstantiveText(strategicFeedback.annotation, 18)) return true;
  if (action?.action && NEGATIVE_FLASHCARD_ACTIONS.has(action.action) && hasSubstantiveText(action.annotation, 18)) {
    return true;
  }
  return Boolean(correction && ["MARK_WRONG", "SUPPRESS_SOURCE", "HIDE"].includes(correction.correctionType));
}

function sourceEvidenceTerms(card) {
  return unique([
    ...tokenize(card.title).slice(0, 5),
    ...tokenize(card.body).slice(0, 8),
    ...(card.sources || []).flatMap((source) => tokenize(source.sourceName || source.sourceId || "").slice(0, 2)),
  ]).slice(0, 12);
}

function buildGroundedAnswerPrompt(company, card, correction = null) {
  const evidence = (card.sources || [])
    .slice(0, 4)
    .map((source) => `- ${compactText(source.sourceName || source.sourceId, 120)}: ${compactText(source.sourceType, 80)}`)
    .join("\n");
  return [
    `Company: ${company.name}`,
    `Industry: ${compactText(company.industry || company.targetMarket || "Unknown", 140)}`,
    company.description ? `Description: ${compactText(company.description, 260)}` : null,
    `Question: What matters about "${compactText(card.title, 160)}" and what should the team do next?`,
    `Existing summary: ${compactText(card.body, 800)}`,
    evidence ? `Supporting evidence:\n${evidence}` : null,
    correction?.note ? `Operator signal: ${compactText(correction.note, 500)}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function groundedAnswerExpected(card, correction = null) {
  const nextActions = correction?.correctionType === "REQUEST_REFRESH"
    ? ["Refresh the linked evidence and revise the card before using it for downstream planning."]
    : ["Review the strongest linked evidence and convert it into the next planning or checklist action if needed."];
  return {
    summary: compactText(card.body, 700),
    confidence: ["VERIFIED", "ACCEPTED"].includes(card.processingStatus) ? "HIGH" : card.processingStatus === "CHECKED" ? "MEDIUM" : "LOW",
    nextActions,
    evidenceTerms: sourceEvidenceTerms(card),
  };
}

function buildSearchRankingPrompt(company, chosenTask, alternatives) {
  const rankedCandidates = [chosenTask, ...alternatives]
    .map((task, index) => `${index + 1}. ${compactText(task.title, 160)} — ${compactText(task.description || "", 220)}`)
    .join("\n");
  return [
    `Company: ${company.name}`,
    `Industry: ${compactText(company.industry || company.targetMarket || "Unknown", 140)}`,
    company.description ? `Description: ${compactText(company.description, 260)}` : null,
    "Rank these task candidates from strongest to weakest for immediate operator attention.",
    "Return strict JSON with rankedTitles and rationale.",
    rankedCandidates,
  ]
    .filter(Boolean)
    .join("\n");
}

function searchRankingExpected(chosenTask, alternatives) {
  return {
    rankedTitles: [chosenTask.title, ...alternatives.map((task) => task.title)],
    rationaleTerms: unique([
      ...tokenize(chosenTask.title).slice(0, 4),
      ...tokenize(chosenTask.description || "").slice(0, 4),
    ]).slice(0, 10),
  };
}

async function writeDatasetFiles(baseDir, dataset) {
  await mkdir(baseDir, { recursive: true });
  await Promise.all([
    writeFile(join(baseDir, "sft_tasks.alpaca.jsonl"), dataset.sftTasks.map(jsonLine).join("")),
    writeFile(join(baseDir, "sft_flashcards.alpaca.jsonl"), dataset.sftFlashcards.map(jsonLine).join("")),
    writeFile(join(baseDir, "prefs_tasks.pairs.jsonl"), dataset.prefTasks.map(jsonLine).join("")),
    writeFile(join(baseDir, "prefs_flashcards.pairs.jsonl"), dataset.prefFlashcards.map(jsonLine).join("")),
    writeFile(join(baseDir, "eval_cases.jsonl"), dataset.evalCases.map(jsonLine).join("")),
  ]);
}

async function exportCompany(company, outputDir) {
  const [tasks, flashcards, strategicFeedback] = await Promise.all([
    prisma.checklistTask.findMany({
      where: { companyId: company.id },
      include: {
        feedback: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.flashcard.findMany({
      where: { companyId: company.id },
      include: {
        actions: {
          orderBy: { createdAt: "desc" },
        },
        corrections: {
          orderBy: { createdAt: "desc" },
        },
        sources: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.strategicFeedback.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const flashcardById = new Map(flashcards.map((card) => [card.id, card]));
  const strategicFeedbackByEntity = new Map();
  for (const entry of strategicFeedback) {
    const key = `${entry.entityType}:${entry.entityId}`;
    if (!strategicFeedbackByEntity.has(key)) {
      strategicFeedbackByEntity.set(key, entry);
    }
  }

  const sftTaskRows = [];
  const sftFlashcardRows = [];
  const prefTaskRows = [];
  const prefFlashcardRows = [];
  const evalRows = [];

  const positiveTasks = [];
  const negativeTasks = [];

  for (const task of tasks) {
    const latestFeedback = task.feedback[0] ?? null;
    const supportingFlashcards = (task.sourceFlashcardIds || [])
      .map((id) => flashcardById.get(id))
      .filter(Boolean);
    const strategicTaskFeedback =
      strategicFeedbackByEntity.get(`TASK:${task.id}`) ||
      strategicFeedbackByEntity.get(`CHECKLIST_TASK:${task.id}`) ||
      null;

    if (taskIsHighSignal(latestFeedback, supportingFlashcards, strategicTaskFeedback)) {
      sftTaskRows.push({
        instruction: "Given company context, operator history, and supporting knowledge, write the best next checklist task as JSON.",
        input: buildTaskInput(company, task, latestFeedback, supportingFlashcards, strategicTaskFeedback),
        output: taskOutput(task, latestFeedback, strategicTaskFeedback),
        metadata: {
          companyId: company.id,
          companyName: company.name,
          entityType: "TASK",
          taskId: task.id,
          publicId: task.publicId ?? null,
          action: strategicTaskFeedback?.action || latestFeedback?.action || null,
          candidateState: task.candidateState,
          signalTier: STRONG_TASK_ACTIONS.has(latestFeedback?.action) || strategicTaskFeedback?.action === "MODIFY_ACCEPT" ? "strong" : "assisted",
          lineage: {
            versionFamilyId: task.versionFamilyId ?? null,
            duplicateClusterId: task.duplicateClusterId ?? null,
            refinedFromId: task.refinedFromId ?? null,
            generatedFromIds: task.generatedFromIds ?? [],
          },
        },
      });

      positiveTasks.push({ task, feedback: latestFeedback, strategicFeedback: strategicTaskFeedback });
      evalRows.push({
        kind: "TASK",
        companyId: company.id,
        companyName: company.name,
        entityId: task.id,
        prompt: buildTaskInput(company, task, latestFeedback, supportingFlashcards, strategicTaskFeedback),
        expected: JSON.parse(taskOutput(task, latestFeedback, strategicTaskFeedback)),
        metadata: {
          action: strategicTaskFeedback?.action || latestFeedback?.action || null,
          sourceFlashcardIds: task.sourceFlashcardIds,
          difficulty: "standard",
          signalTier: STRONG_TASK_ACTIONS.has(latestFeedback?.action) ? "strong" : "assisted",
        },
      });

      if (
        STRONG_TASK_ACTIONS.has(latestFeedback?.action) ||
        hasSubstantiveText(latestFeedback?.annotation) ||
        hasSubstantiveText(latestFeedback?.deliveryComment) ||
        hasSubstantiveText(strategicTaskFeedback?.annotation)
      ) {
        evalRows.push({
          kind: "TASK",
          companyId: company.id,
          companyName: company.name,
          entityId: `${task.id}:hard`,
          prompt: buildTaskHardInput(company, task, latestFeedback, supportingFlashcards, strategicTaskFeedback),
          expected: JSON.parse(taskOutput(task, latestFeedback, strategicTaskFeedback)),
          metadata: {
            action: strategicTaskFeedback?.action || latestFeedback?.action || null,
            sourceFlashcardIds: task.sourceFlashcardIds,
            difficulty: "hard",
            signalTier: "operator-guided",
          },
        });
      }
    } else if (taskIsStrongNegative(latestFeedback, strategicTaskFeedback)) {
      negativeTasks.push({ task, feedback: latestFeedback, strategicFeedback: strategicTaskFeedback });
    }
  }

  const taskPairCount = Math.min(positiveTasks.length, negativeTasks.length);
  for (let index = 0; index < taskPairCount; index += 1) {
    const chosen = positiveTasks[index];
    const rejected = negativeTasks[index];
    prefTaskRows.push({
      prompt: pairPrompt(company, "task"),
      chosen: taskOutput(chosen.task, chosen.feedback, chosen.strategicFeedback),
      rejected: taskOutput(rejected.task, rejected.feedback, rejected.strategicFeedback),
      metadata: {
        companyId: company.id,
        chosenTaskId: chosen.task.id,
        rejectedTaskId: rejected.task.id,
        chosenAction: chosen.strategicFeedback?.action || chosen.feedback?.action || null,
        rejectedAction: rejected.strategicFeedback?.action || rejected.feedback?.action || null,
      },
    });
  }

  const positiveCards = [];
  const negativeCards = [];

  for (const card of flashcards) {
    const latestAction = card.actions[0] ?? null;
    const latestCorrection = card.corrections[0] ?? null;
    const strategicKnowledgeFeedback =
      strategicFeedbackByEntity.get(`KNOWLEDGE:${card.id}`) ||
      strategicFeedbackByEntity.get(`FLASHCARD:${card.id}`) ||
      null;

    if (flashcardIsHighSignal(latestAction, latestCorrection, strategicKnowledgeFeedback)) {
      sftFlashcardRows.push({
        instruction: "Given company context and supporting evidence, write the best knowledge flashcard as JSON.",
        input: buildFlashcardInput(company, card, strategicKnowledgeFeedback),
        output: flashcardOutput(card, latestAction, latestCorrection, strategicKnowledgeFeedback),
        metadata: {
          companyId: company.id,
          companyName: company.name,
          entityType: "FLASHCARD",
          flashcardId: card.id,
          publicId: card.publicId ?? null,
          action: strategicKnowledgeFeedback?.action || latestAction?.action || null,
          correctionType: latestCorrection?.correctionType ?? null,
          kind: card.kind,
          signalTier:
            latestAction?.action === "MODIFY_ACCEPT"
              ? "strong"
              : latestCorrection
                ? "corrected"
                : strategicKnowledgeFeedback
                  ? "strategic"
                  : "annotated",
          lineage: {
            versionFamilyId: card.versionFamilyId ?? null,
            duplicateClusterId: card.duplicateClusterId ?? null,
            refinedFromId: card.refinedFromId ?? null,
            generatedFromIds: card.generatedFromIds ?? [],
          },
        },
      });

      positiveCards.push({ card, action: latestAction, correction: latestCorrection, strategicFeedback: strategicKnowledgeFeedback });
      evalRows.push({
        kind: "FLASHCARD",
        companyId: company.id,
        companyName: company.name,
        entityId: card.id,
        prompt: buildFlashcardInput(company, card, strategicKnowledgeFeedback),
        expected: JSON.parse(flashcardOutput(card, latestAction, latestCorrection, strategicKnowledgeFeedback)),
        metadata: {
          action: strategicKnowledgeFeedback?.action || latestAction?.action || null,
          correctionType: latestCorrection?.correctionType ?? null,
          difficulty: "standard",
        },
      });

      evalRows.push({
        kind: "GROUNDED_ANSWER",
        companyId: company.id,
        companyName: company.name,
        entityId: `${card.id}:grounded`,
        prompt: buildGroundedAnswerPrompt(company, card, latestCorrection),
        expected: groundedAnswerExpected(card, latestCorrection),
        metadata: {
          sourceCount: card.sources.length,
          correctionType: latestCorrection?.correctionType ?? null,
          difficulty: "grounded",
        },
      });

      if (
        latestCorrection ||
        latestAction?.action === "MODIFY_ACCEPT" ||
        hasSubstantiveText(latestAction?.annotation) ||
        hasSubstantiveText(strategicKnowledgeFeedback?.annotation)
      ) {
        evalRows.push({
          kind: "FLASHCARD",
          companyId: company.id,
          companyName: company.name,
          entityId: `${card.id}:hard`,
          prompt: buildFlashcardHardInput(company, card, latestAction, latestCorrection, strategicKnowledgeFeedback),
          expected: JSON.parse(flashcardOutput(card, latestAction, latestCorrection, strategicKnowledgeFeedback)),
          metadata: {
            action: strategicKnowledgeFeedback?.action || latestAction?.action || null,
            correctionType: latestCorrection?.correctionType ?? null,
            difficulty: "hard",
          },
        });
      }
    } else if (flashcardIsStrongNegative(latestAction, latestCorrection, strategicKnowledgeFeedback)) {
      negativeCards.push({ card, action: latestAction, correction: latestCorrection, strategicFeedback: strategicKnowledgeFeedback });
    }
  }

  const flashcardPairCount = Math.min(positiveCards.length, negativeCards.length);
  for (let index = 0; index < flashcardPairCount; index += 1) {
    const chosen = positiveCards[index];
    const rejected = negativeCards[index];
    prefFlashcardRows.push({
      prompt: pairPrompt(company, "knowledge flashcard"),
      chosen: flashcardOutput(chosen.card, chosen.action, chosen.correction, chosen.strategicFeedback),
      rejected: flashcardOutput(rejected.card, rejected.action, rejected.correction, rejected.strategicFeedback),
      metadata: {
        companyId: company.id,
        chosenFlashcardId: chosen.card.id,
        rejectedFlashcardId: rejected.card.id,
        chosenAction: chosen.strategicFeedback?.action || chosen.action?.action || null,
        rejectedAction: rejected.strategicFeedback?.action || rejected.action?.action || null,
      },
    });
  }

  for (const { task, feedback, strategicFeedback: strategicTaskFeedback } of positiveTasks) {
    if (feedback?.action !== "MODIFY_ACCEPT" && feedback?.action !== "DELIVER" && strategicTaskFeedback?.action !== "MODIFY_ACCEPT") continue;
    const original = JSON.stringify(
      {
        title: task.title,
        description: compactText(task.description || "", 1200),
        impact: task.impact,
        confidence: task.confidence,
        ease: task.ease,
        rationale: compactText(task.userAnnotation || "Pre-feedback draft.", 800),
      },
      null,
      0,
    );
    const chosen = taskOutput(task, feedback, strategicTaskFeedback);
    if (chosen === original) continue;
    prefTaskRows.push({
      prompt: pairPrompt(company, "task refinement"),
      chosen,
      rejected: original,
      metadata: {
        companyId: company.id,
        chosenTaskId: task.id,
        rejectedTaskId: task.id,
        chosenAction: strategicTaskFeedback?.action || feedback?.action || null,
        rejectedAction: "ORIGINAL_DRAFT",
      },
    });
  }

  for (const { card, action, correction, strategicFeedback: strategicKnowledgeFeedback } of positiveCards) {
    if (action?.action !== "MODIFY_ACCEPT" && strategicKnowledgeFeedback?.action !== "MODIFY_ACCEPT") continue;
    const original = JSON.stringify(
      {
        title: card.title,
        body: compactText(card.body || "", 1400),
        kind: card.kind,
        impact: card.impact,
        confidence: card.confidence,
        weight: card.weight,
        rationale: compactText(card.userAnnotation || "Pre-feedback flashcard draft.", 700),
      },
      null,
      0,
    );
    const chosen = flashcardOutput(card, action, correction, strategicKnowledgeFeedback);
    if (chosen === original) continue;
    prefFlashcardRows.push({
      prompt: pairPrompt(company, "knowledge flashcard refinement"),
      chosen,
      rejected: original,
      metadata: {
        companyId: company.id,
        chosenFlashcardId: card.id,
        rejectedFlashcardId: card.id,
        chosenAction: strategicKnowledgeFeedback?.action || action?.action || null,
        rejectedAction: "ORIGINAL_DRAFT",
      },
    });
  }

  for (let index = 0; index < Math.min(positiveTasks.length, 12); index += 1) {
    const chosen = positiveTasks[index]?.task;
    if (!chosen) continue;
    const alternatives = tasks
      .filter((task) => task.id !== chosen.id)
      .sort((left, right) => {
        const rightSignal = (right.feedback[0]?.action === "DECLINE" ? 1 : 0) - (left.feedback[0]?.action === "DECLINE" ? 1 : 0);
        if (rightSignal !== 0) return rightSignal;
        return new Date(left.updatedAt).getTime() - new Date(right.updatedAt).getTime();
      })
      .slice(0, 2);
    if (alternatives.length < 2) continue;
    evalRows.push({
      kind: "SEARCH_RANKING",
      companyId: company.id,
      companyName: company.name,
      entityId: `${chosen.id}:ranking`,
      prompt: buildSearchRankingPrompt(company, chosen, alternatives),
      expected: searchRankingExpected(chosen, alternatives),
      metadata: {
        chosenTaskId: chosen.id,
        comparedTaskIds: alternatives.map((task) => task.id),
        difficulty: "ranking",
      },
    });
  }

  const dataset = {
    sftTasks: sftTaskRows,
    sftFlashcards: sftFlashcardRows,
    prefTasks: prefTaskRows,
    prefFlashcards: prefFlashcardRows,
    evalCases: evalRows,
  };

  const companyDir = join(outputDir, "companies", `${company.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${company.id.slice(0, 8)}`);
  await writeDatasetFiles(companyDir, dataset);

  return {
    companyId: company.id,
    companyName: company.name,
    counts: {
      sftTasks: sftTaskRows.length,
      sftFlashcards: sftFlashcardRows.length,
      prefTasks: prefTaskRows.length,
      prefFlashcards: prefFlashcardRows.length,
      evalCases: evalRows.length,
    },
    paths: {
      directory: companyDir,
      sftTasks: join(companyDir, "sft_tasks.alpaca.jsonl"),
      sftFlashcards: join(companyDir, "sft_flashcards.alpaca.jsonl"),
      prefTasks: join(companyDir, "prefs_tasks.pairs.jsonl"),
      prefFlashcards: join(companyDir, "prefs_flashcards.pairs.jsonl"),
      evalCases: join(companyDir, "eval_cases.jsonl"),
    },
    files: dataset,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = isoStamp();
  const outputDir = resolve(args.out || join(process.cwd(), "training", "exports", runId));
  await mkdir(outputDir, { recursive: true });

  const companies = await prisma.company.findMany({
    where: args.company ? { id: args.company } : undefined,
    orderBy: { createdAt: "asc" },
  });

  if (companies.length === 0) {
    throw new Error(args.company ? `No company found for id ${args.company}` : "No companies found.");
  }

  const manifest = {
    generatedAt: new Date().toISOString(),
    outputDir,
    datasetFamilies: {
      supervisedFineTuning: ["sft_tasks.alpaca.jsonl", "sft_flashcards.alpaca.jsonl"],
      preferencePairs: ["prefs_tasks.pairs.jsonl", "prefs_flashcards.pairs.jsonl"],
      evaluationCases: ["eval_cases.jsonl"],
    },
    companies: [],
    aggregateCounts: {
      sftTasks: 0,
      sftFlashcards: 0,
      prefTasks: 0,
      prefFlashcards: 0,
      evalCases: 0,
    },
  };

  const aggregated = {
    sftTasks: [],
    sftFlashcards: [],
    prefTasks: [],
    prefFlashcards: [],
    evalCases: [],
  };

  for (const company of companies) {
    const result = await exportCompany(company, outputDir);
    manifest.companies.push({
      companyId: result.companyId,
      companyName: result.companyName,
      counts: result.counts,
      paths: result.paths,
    });
    manifest.aggregateCounts.sftTasks += result.counts.sftTasks;
    manifest.aggregateCounts.sftFlashcards += result.counts.sftFlashcards;
    manifest.aggregateCounts.prefTasks += result.counts.prefTasks;
    manifest.aggregateCounts.prefFlashcards += result.counts.prefFlashcards;
    manifest.aggregateCounts.evalCases += result.counts.evalCases;
    aggregated.sftTasks.push(...result.files.sftTasks);
    aggregated.sftFlashcards.push(...result.files.sftFlashcards);
    aggregated.prefTasks.push(...result.files.prefTasks);
    aggregated.prefFlashcards.push(...result.files.prefFlashcards);
    aggregated.evalCases.push(...result.files.evalCases);
  }

  await writeDatasetFiles(outputDir, aggregated);
  await writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`Training datasets exported to ${outputDir}`);
  console.log(JSON.stringify(manifest, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
