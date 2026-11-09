// @ts-check
import { buildOperations } from "./logic.js";

/**
 * Entry point for the cart.lines.discounts.generate.run target.
 * @param {import("../generated/api").Input} input
 * @returns {import("../generated/api").CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  return buildOperations(input);
}
