import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const board = readFileSync("src/components/sales-board.tsx", "utf8");
const route = readFileSync("src/app/api/opportunitycards/route.ts", "utf8");

assert.match(board, /detailId/, "sales board must track selected detail id");
assert.match(board, /detailItem/, "sales board must store separately fetched detail item");
assert.match(board, /fetch\(`\/api\/opportunitycards\?companyId=.*id=/s, "sales board must fetch detail by id when modal opens");
assert.match(route, /if\s*\(\s*id\s*\)[\s\S]*include:\s*{[\s\S]*feedback/, "opportunity detail branch must include feedback only for id reads");
assert.match(route, /payload:\s*"board-summary"/, "opportunity list branch must remain board-summary");

console.log("modal lazy detail guard OK");
