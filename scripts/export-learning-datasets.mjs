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

function jsonLine(value) {
  return `${JSON.stringify(value)}\n`;
}

function taskOutput(task, feedback) {
  return JSON.stringify(
    {
      title: task.title,
      description: compactText(feedback?.modifiedDescription || task.description || "", 1200),
      impact: task.impact,
      confidence: task.confidence,
      ease: task.ease,
      rationale: compactText(
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

function flashcardOutput(card, action) {
  return JSON.stringify(
    {
      title: action?.modifiedTitle || card.title,
      body: compactText(action?.modifiedBody || card.body || "", 1400),
      kind: card.kind,
      impact: card.impact,
      confidence: card.confidence,
      weight: card.weight,
      rationale: compactText(
        action?.annotation || card.userAnnotation || "Operator-validated knowledge card.",
        700,
      ),
    },
    null,
    0,
  );
}

function buildTaskInput(company, task, feedback, flashcards) {
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
    evidence ? `Supporting knowledge:\n${evidence}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildFlashcardInput(company, card) {
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
    card.userAnnotation ? `Operator annotation: ${compactText(card.userAnnotation, 400)}` : null,
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

async function exportCompany(company, outputDir) {
  const [tasks, flashcards] = await Promise.all([
    prisma.nBAItem.findMany({
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
  ]);

  const flashcardById = new Map(flashcards.map((card) => [card.id, card]));

  const sftTaskRows = [];
  const sftFlashcardRows = [];
  const prefTaskRows = [];
  const prefFlashcardRows = [];
  const evalRows = [];

  const positiveTasks = [];
  const negativeTasks = [];

  for (const task of tasks) {
    const latestFeedback = task.feedback[0] ?? null;
    if (latestFeedback?.action && POSITIVE_TASK_ACTIONS.has(latestFeedback.action)) {
      const supportingFlashcards = (task.sourceFlashcardIds || [])
        .map((id) => flashcardById.get(id))
        .filter(Boolean);

      sftTaskRows.push({
        instruction: "Given company context, operator history, and supporting knowledge, write the best next checklist task as JSON.",
        input: buildTaskInput(company, task, latestFeedback, supportingFlashcards),
        output: taskOutput(task, latestFeedback),
        metadata: {
          companyId: company.id,
          companyName: company.name,
          entityType: "TASK",
          taskId: task.id,
          publicId: task.publicId ?? null,
          action: latestFeedback.action,
          candidateState: task.candidateState,
        },
      });

      positiveTasks.push({ task, feedback: latestFeedback });
      evalRows.push({
        kind: "TASK",
        companyId: company.id,
        companyName: company.name,
        entityId: task.id,
        prompt: buildTaskInput(company, task, latestFeedback, supportingFlashcards),
        expected: JSON.parse(taskOutput(task, latestFeedback)),
        metadata: {
          action: latestFeedback.action,
          sourceFlashcardIds: task.sourceFlashcardIds,
        },
      });
    } else if (latestFeedback?.action === "DECLINE") {
      negativeTasks.push({ task, feedback: latestFeedback });
    }
  }

  const taskPairCount = Math.min(positiveTasks.length, negativeTasks.length);
  for (let index = 0; index < taskPairCount; index += 1) {
    const chosen = positiveTasks[index];
    const rejected = negativeTasks[index];
    prefTaskRows.push({
      prompt: pairPrompt(company, "task"),
      chosen: taskOutput(chosen.task, chosen.feedback),
      rejected: taskOutput(rejected.task, rejected.feedback),
      metadata: {
        companyId: company.id,
        chosenTaskId: chosen.task.id,
        rejectedTaskId: rejected.task.id,
        chosenAction: chosen.feedback.action,
        rejectedAction: rejected.feedback.action,
      },
    });
  }

  const positiveCards = [];
  const negativeCards = [];

  for (const card of flashcards) {
    const latestAction = card.actions[0] ?? null;
    const latestCorrection = card.corrections[0] ?? null;

    if (latestAction?.action && POSITIVE_FLASHCARD_ACTIONS.has(latestAction.action)) {
      sftFlashcardRows.push({
        instruction: "Given company context and supporting evidence, write the best knowledge flashcard as JSON.",
        input: buildFlashcardInput(company, card),
        output: flashcardOutput(card, latestAction),
        metadata: {
          companyId: company.id,
          companyName: company.name,
          entityType: "FLASHCARD",
          flashcardId: card.id,
          publicId: card.publicId ?? null,
          action: latestAction.action,
          kind: card.kind,
        },
      });

      positiveCards.push({ card, action: latestAction });
      evalRows.push({
        kind: "FLASHCARD",
        companyId: company.id,
        companyName: company.name,
        entityId: card.id,
        prompt: buildFlashcardInput(company, card),
        expected: JSON.parse(flashcardOutput(card, latestAction)),
        metadata: {
          action: latestAction.action,
          correctionType: latestCorrection?.correctionType ?? null,
        },
      });
    } else if (
      latestAction?.action && NEGATIVE_FLASHCARD_ACTIONS.has(latestAction.action)
    ) {
      negativeCards.push({ card, action: latestAction });
    }
  }

  const flashcardPairCount = Math.min(positiveCards.length, negativeCards.length);
  for (let index = 0; index < flashcardPairCount; index += 1) {
    const chosen = positiveCards[index];
    const rejected = negativeCards[index];
    prefFlashcardRows.push({
      prompt: pairPrompt(company, "knowledge flashcard"),
      chosen: flashcardOutput(chosen.card, chosen.action),
      rejected: flashcardOutput(rejected.card, rejected.action),
      metadata: {
        companyId: company.id,
        chosenFlashcardId: chosen.card.id,
        rejectedFlashcardId: rejected.card.id,
        chosenAction: chosen.action.action,
        rejectedAction: rejected.action.action,
      },
    });
  }

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
    files: {
      sftTasks: sftTaskRows,
      sftFlashcards: sftFlashcardRows,
      prefTasks: prefTaskRows,
      prefFlashcards: prefFlashcardRows,
      evalCases: evalRows,
    },
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
    companies: [],
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
    });
    aggregated.sftTasks.push(...result.files.sftTasks);
    aggregated.sftFlashcards.push(...result.files.sftFlashcards);
    aggregated.prefTasks.push(...result.files.prefTasks);
    aggregated.prefFlashcards.push(...result.files.prefFlashcards);
    aggregated.evalCases.push(...result.files.evalCases);
  }

  await Promise.all([
    writeFile(join(outputDir, "sft_tasks.alpaca.jsonl"), aggregated.sftTasks.map(jsonLine).join("")),
    writeFile(join(outputDir, "sft_flashcards.alpaca.jsonl"), aggregated.sftFlashcards.map(jsonLine).join("")),
    writeFile(join(outputDir, "prefs_tasks.pairs.jsonl"), aggregated.prefTasks.map(jsonLine).join("")),
    writeFile(join(outputDir, "prefs_flashcards.pairs.jsonl"), aggregated.prefFlashcards.map(jsonLine).join("")),
    writeFile(join(outputDir, "eval_cases.jsonl"), aggregated.evalCases.map(jsonLine).join("")),
    writeFile(join(outputDir, "manifest.json"), JSON.stringify(manifest, null, 2)),
  ]);

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
