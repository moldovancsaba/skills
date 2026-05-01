/**
 * checklist JUDGE — backward-compat shim
 * v2.1.0
 *
 * All functionality has been moved to evaluator.js (Trinity M2.3).
 * This file re-exports from evaluator.js so existing callers are unaffected.
 */
const { auditCheckedFlashCard } = require("./evaluator");

module.exports = {
  auditCheckedFlashCard,
};
