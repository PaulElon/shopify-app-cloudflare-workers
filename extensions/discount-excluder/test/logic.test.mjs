import test from "node:test";
import assert from "node:assert/strict";
import { buildOperations } from "../src/logic.js";

const line = (id, productId, { inCol = false, hasTag = false, qty = 1 } = {}) => ({
  id: `gid://shopify/CartLine/${id}`, quantity: qty,
  merchandise: { __typename: "ProductVariant", id: `gid://shopify/ProductVariant/${id}`,
    product: { id: `gid://shopify/Product/${productId}`, inAnyCollection: inCol, hasAnyTag: hasTag } },
});
const input = (lines, config, { subtotal = "100.00", classes = ["PRODUCT"] } = {}) => ({
  cart: { cost: { subtotalAmount: { amount: subtotal } }, lines },
  discount: { discountClasses: classes, metafield: config === undefined ? null : { jsonValue: config } },
});
const pct = (overrides = {}) => ({ valueType: "percentage", value: 20, excludedProductIds: [], ...overrides });
const targetsOf = (r) => r.operations[0].productDiscountsAdd.candidates[0].targets.map((t) => t.cartLine.id);

test("no exclusions: every line is discounted", () => {
  const r = buildOperations(input([line(1, 11), line(2, 22)], pct()));
  assert.deepEqual(targetsOf(r), ["gid://shopify/CartLine/1", "gid://shopify/CartLine/2"]);
  assert.equal(r.operations[0].productDiscountsAdd.candidates[0].value.percentage.value, "20.0");
  assert.equal(r.operations[0].productDiscountsAdd.selectionStrategy, "FIRST");
});
test("product excluded by id", () => {
  const r = buildOperations(input([line(1, 11), line(2, 22)], pct({ excludedProductIds: ["gid://shopify/Product/22"] })));
  assert.deepEqual(targetsOf(r), ["gid://shopify/CartLine/1"]);
});
test("collection excluded (resolved by input variable)", () => {
  const r = buildOperations(input([line(1, 11, { inCol: true }), line(2, 22)], pct()));
  assert.deepEqual(targetsOf(r), ["gid://shopify/CartLine/2"]);
});
test("tag excluded (resolved by input variable)", () => {
  const r = buildOperations(input([line(1, 11), line(2, 22, { hasTag: true })], pct()));
  assert.deepEqual(targetsOf(r), ["gid://shopify/CartLine/1"]);
});
test("mixed cart with custom product line is skipped", () => {
  const custom = { id: "gid://shopify/CartLine/9", quantity: 1, merchandise: { __typename: "CustomProduct" } };
  const r = buildOperations(input([line(1, 11), custom, line(3, 33, { inCol: true })], pct({ excludedProductIds: ["gid://shopify/Product/11"] })));
  assert.deepEqual(r, { operations: [] });
});
test("minimum subtotal not met: no discount", () => {
  const r = buildOperations(input([line(1, 11)], pct({ minSubtotal: 150 }), { subtotal: "100.00" }));
  assert.deepEqual(r, { operations: [] });
});
test("minimum subtotal met: discount applies", () => {
  const r = buildOperations(input([line(1, 11)], pct({ minSubtotal: 100 }), { subtotal: "100.00" }));
  assert.deepEqual(targetsOf(r), ["gid://shopify/CartLine/1"]);
});
test("zero eligible lines: no operations", () => {
  const r = buildOperations(input([line(1, 11, { hasTag: true })], pct()));
  assert.deepEqual(r, { operations: [] });
});
test("percentage capped at 100 and formatted", () => {
  const r = buildOperations(input([line(1, 11)], pct({ value: 250 })));
  assert.equal(r.operations[0].productDiscountsAdd.candidates[0].value.percentage.value, "100.0");
});
test("fixed amount spreads across targets", () => {
  const r = buildOperations(input([line(1, 11), line(2, 22)], { valueType: "fixedAmount", value: 15, excludedProductIds: [] }));
  assert.deepEqual(r.operations[0].productDiscountsAdd.candidates[0].value, { fixedAmount: { amount: "15.00", appliesToEachItem: false } });
  assert.equal(r.operations[0].productDiscountsAdd.candidates[0].message, "15.00 off");
});
test("missing config or wrong discount class: no operations", () => {
  assert.deepEqual(buildOperations(input([line(1, 11)], undefined)), { operations: [] });
  assert.deepEqual(buildOperations(input([line(1, 11)], pct(), { classes: ["ORDER"] })), { operations: [] });
  assert.deepEqual(buildOperations(input([line(1, 11)], pct({ value: 0 }))), { operations: [] });
});
test("custom message is used", () => {
  const r = buildOperations(input([line(1, 11)], pct({ message: "  Fall sale  " })));
  assert.equal(r.operations[0].productDiscountsAdd.candidates[0].message, "Fall sale");
});
