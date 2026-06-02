import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const opportunityRoute = readFileSync("src/app/api/opportunitycards/route.ts", "utf8");
const salesClient = readFileSync("src/app/[companyId]/sales/sales-client.tsx", "utf8");
const salesBoard = readFileSync("src/components/sales-board.tsx", "utf8");

const detailBranchStart = opportunityRoute.indexOf("if (id)");
const listBranchStart = opportunityRoute.indexOf("const where: Prisma.OpportunitycardWhereInput");
assert.notEqual(detailBranchStart, -1, "detail read must be separated by id");
assert.notEqual(listBranchStart, -1, "board list branch must build an explicit where clause");
assert.ok(detailBranchStart < listBranchStart, "detail branch must execute before board list branch");
const detailBranch = opportunityRoute.slice(detailBranchStart, listBranchStart);
const listBranch = opportunityRoute.slice(listBranchStart, opportunityRoute.indexOf("} catch", listBranchStart));

assert.match(opportunityRoute, /payload:\s*"board-summary"/, "opportunity board route must identify board-summary payloads");
assert.match(detailBranch, /include:\s*{[\s\S]*feedback:/, "detail branch must include feedback detail");
assert.match(listBranch, /select:\s*{[\s\S]*companyName:[\s\S]*title:[\s\S]*kanbanColumn:[\s\S]*sortOrder:/, "board list must select lean summary fields");
assert.doesNotMatch(listBranch, /include\s*:/, "board list must not include relation detail");
assert.doesNotMatch(listBranch, /feedback\s*:/, "board list must not include feedback detail");
assert.match(salesClient, /view=board/, "sales page must request board view");
assert.match(salesBoard, /openDetail/, "sales board must lazy-load modal detail");
assert.match(salesBoard, /detailLoading/, "sales board must expose modal loading state");

console.log("lean board payload guard OK");
