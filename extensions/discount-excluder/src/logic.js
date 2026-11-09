// Pure discount logic for Discount Excluder. No Shopify imports, so it is unit-testable with plain Node.
// Config (JSON metafield "$app:discount-excluder" / "function-configuration"):
// { valueType: "percentage" | "fixedAmount", value: number, excludedProductIds: [gid], minSubtotal?: number, message?: string }
// Collection and tag exclusions are evaluated by Shopify through input-query variables
// ($excludedCollectionIds, $excludedTags from metafield "$app:discount-excluder" / "input-variables"),
// so each line arrives with product.inAnyCollection and product.hasAnyTag already resolved.

export function buildOperations(input) {
  const discount = input && input.discount;
  const config = discount && discount.metafield && discount.metafield.jsonValue;
  if (!config || !Array.isArray(discount.discountClasses) || !discount.discountClasses.includes("PRODUCT")) {
    return { operations: [] };
  }
  const value = Number(config.value);
  if (!(value > 0)) return { operations: [] };

  const minSubtotal = config.minSubtotal == null ? 0 : Number(config.minSubtotal);
  const subtotal = Number(input.cart && input.cart.cost && input.cart.cost.subtotalAmount && input.cart.cost.subtotalAmount.amount);
  if (minSubtotal > 0 && !(subtotal >= minSubtotal)) return { operations: [] };

  const excludedProducts = new Set(Array.isArray(config.excludedProductIds) ? config.excludedProductIds : []);
  const targets = [];
  for (const line of (input.cart && input.cart.lines) || []) {
    const m = line.merchandise;
    if (!m || m.__typename !== "ProductVariant" || !m.product) continue;
    const p = m.product;
    if (excludedProducts.has(p.id) || p.inAnyCollection === true || p.hasAnyTag === true) continue;
    targets.push({ cartLine: { id: line.id } });
  }
  if (targets.length === 0) return { operations: [] };

  const candidateValue = config.valueType === "fixedAmount"
    ? { fixedAmount: { amount: value.toFixed(2), appliesToEachItem: false } }
    : { percentage: { value: Math.min(value, 100).toFixed(1) } };

  const message = typeof config.message === "string" && config.message.trim()
    ? config.message.trim()
    : (config.valueType === "fixedAmount" ? `${value.toFixed(2)} off` : `${Math.min(value, 100)}% off`);

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates: [{ message, targets, value: candidateValue }],
          selectionStrategy: "FIRST",
        },
      },
    ],
  };
}
