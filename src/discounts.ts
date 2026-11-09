import type { Session } from "@shopify/shopify-api";
import { gql, HttpError, type Env } from "./shopify";

export const NAMESPACE = "$app:discount-excluder";
export const FUNCTION_HANDLE = "discount-excluder";

export type Ref = { id: string; title: string };
export type DiscountForm = {
  title: string;
  method: "automatic" | "code";
  code?: string;
  valueType: "percentage" | "fixedAmount";
  value: number;
  excludedProducts: Ref[];
  excludedCollections: Ref[];
  excludedTags: string[];
  minSubtotal?: number | null;
  message?: string;
  startsAt?: string;
  endsAt?: string | null;
  combinesWith: { orderDiscounts: boolean; productDiscounts: boolean; shippingDiscounts: boolean };
};

const DISCOUNT_FIELDS = `
  id
  config: metafield(namespace: "${NAMESPACE}", key: "function-configuration") { value }
  vars: metafield(namespace: "${NAMESPACE}", key: "input-variables") { value }
  discount {
    __typename
    ... on DiscountAutomaticApp { title status startsAt endsAt appDiscountType { functionId } combinesWith { orderDiscounts productDiscounts shippingDiscounts } }
    ... on DiscountCodeApp { title status startsAt endsAt appDiscountType { functionId } combinesWith { orderDiscounts productDiscounts shippingDiscounts } codes(first: 1) { nodes { code } } }
  }`;

export function validateForm(raw: any): DiscountForm {
  const bad = (m: string) => { throw new HttpError(400, m); };
  const title = String(raw?.title || "").trim();
  if (!title) bad("Title is required");
  const method = raw.method === "code" ? "code" : "automatic";
  const code = method === "code" ? String(raw.code || "").trim() : undefined;
  if (method === "code" && !code) bad("Discount code is required");
  const valueType = raw.valueType === "fixedAmount" ? "fixedAmount" : "percentage";
  const value = Number(raw.value);
  if (!(value > 0)) bad("Discount value must be greater than zero");
  if (valueType === "percentage" && value > 100) bad("Percentage cannot exceed 100");
  const refs = (list: any): Ref[] => Array.isArray(list) ? list.filter((r) => r && typeof r.id === "string").map((r) => ({ id: r.id, title: String(r.title || "") })).slice(0, 250) : [];
  const excludedTags = Array.isArray(raw.excludedTags) ? raw.excludedTags.map((t: any) => String(t).trim()).filter(Boolean).slice(0, 100) : [];
  const minSubtotal = raw.minSubtotal === "" || raw.minSubtotal == null ? null : Number(raw.minSubtotal);
  if (minSubtotal != null && !(minSubtotal >= 0)) bad("Minimum subtotal must be a positive number");
  const startsAt = raw.startsAt ? new Date(raw.startsAt).toISOString() : new Date().toISOString();
  const endsAt = raw.endsAt ? new Date(raw.endsAt).toISOString() : null;
  return {
    title, method, code, valueType, value,
    excludedProducts: refs(raw.excludedProducts), excludedCollections: refs(raw.excludedCollections), excludedTags,
    minSubtotal, message: String(raw.message || "").trim().slice(0, 120), startsAt, endsAt,
    combinesWith: {
      orderDiscounts: !!raw.combinesWith?.orderDiscounts,
      productDiscounts: !!raw.combinesWith?.productDiscounts,
      shippingDiscounts: !!raw.combinesWith?.shippingDiscounts,
    },
  };
}

function metafields(form: DiscountForm) {
  const functionConfiguration = {
    valueType: form.valueType, value: form.value,
    excludedProductIds: form.excludedProducts.map((p) => p.id),
    minSubtotal: form.minSubtotal ?? null, message: form.message || "",
    // UI-only: titles so the edit form can show names without extra API calls
    excludedProducts: form.excludedProducts, excludedCollections: form.excludedCollections,
  };
  const inputVariables = { excludedCollectionIds: form.excludedCollections.map((c) => c.id), excludedTags: form.excludedTags };
  return [
    { namespace: NAMESPACE, key: "function-configuration", type: "json", value: JSON.stringify(functionConfiguration) },
    { namespace: NAMESPACE, key: "input-variables", type: "json", value: JSON.stringify(inputVariables) },
  ];
}

function baseInput(form: DiscountForm) {
  return {
    title: form.title,
    functionHandle: FUNCTION_HANDLE,
    discountClasses: ["PRODUCT"],
    combinesWith: form.combinesWith,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
  };
}

function userErrors(payload: any, label: string) {
  const errs = payload?.userErrors;
  if (Array.isArray(errs) && errs.length) throw new HttpError(422, `${label}: ${errs.map((e: any) => e.message).join("; ")}`);
}

export async function createDiscount(env: Env, session: Session, form: DiscountForm): Promise<string> {
  if (form.method === "automatic") {
    const d = await gql(env, session, `mutation Create($discount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $discount) { automaticAppDiscount { discountId } userErrors { field message } } }`,
      { discount: { ...baseInput(form), metafields: metafields(form) } });
    userErrors(d.discountAutomaticAppCreate, "Could not create discount");
    return d.discountAutomaticAppCreate.automaticAppDiscount.discountId;
  }
  const d = await gql(env, session, `mutation Create($discount: DiscountCodeAppInput!) {
    discountCodeAppCreate(codeAppDiscount: $discount) { codeAppDiscount { discountId } userErrors { field message } } }`,
    { discount: { ...baseInput(form), code: form.code, metafields: metafields(form) } });
  userErrors(d.discountCodeAppCreate, "Could not create discount");
  return d.discountCodeAppCreate.codeAppDiscount.discountId;
}

export async function updateDiscount(env: Env, session: Session, id: string, form: DiscountForm): Promise<void> {
  const existing = await getDiscount(env, session, id);
  if (!existing) throw new HttpError(404, "Discount not found");
  if (existing.method !== form.method) throw new HttpError(400, "Switching between automatic and code is not supported; create a new discount instead");
  const input = { ...baseInput(form), ...(form.method === "code" ? { code: form.code } : {}) };
  const d = form.method === "automatic"
    ? await gql(env, session, `mutation Update($id: ID!, $discount: DiscountAutomaticAppInput!) { discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) { userErrors { field message } } }`, { id, discount: input })
    : await gql(env, session, `mutation Update($id: ID!, $discount: DiscountCodeAppInput!) { discountCodeAppUpdate(id: $id, codeAppDiscount: $discount) { userErrors { field message } } }`, { id, discount: input });
  userErrors(d.discountAutomaticAppUpdate || d.discountCodeAppUpdate, "Could not update discount");
  const m = await gql(env, session, `mutation Set($metafields: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $metafields) { userErrors { field message } } }`,
    { metafields: metafields(form).map((f) => ({ ...f, ownerId: id })) });
  userErrors(m.metafieldsSet, "Could not save discount settings");
}

export type DiscountRow = {
  id: string; title: string; method: "automatic" | "code"; code?: string; status: string;
  startsAt?: string; endsAt?: string | null; functionId?: string;
  form: DiscountForm;
};

function toRow(node: any): DiscountRow | null {
  if (!node?.config?.value) return null; // not one of ours
  const cfg = JSON.parse(node.config.value);
  const vars = node.vars?.value ? JSON.parse(node.vars.value) : { excludedCollectionIds: [], excludedTags: [] };
  const d = node.discount;
  const method = d.__typename === "DiscountCodeApp" ? "code" : "automatic";
  const code = method === "code" ? d.codes?.nodes?.[0]?.code : undefined;
  const excludedCollections: Ref[] = Array.isArray(cfg.excludedCollections) && cfg.excludedCollections.length
    ? cfg.excludedCollections : (vars.excludedCollectionIds || []).map((id: string) => ({ id, title: "" }));
  const excludedProducts: Ref[] = Array.isArray(cfg.excludedProducts) && cfg.excludedProducts.length
    ? cfg.excludedProducts : (cfg.excludedProductIds || []).map((id: string) => ({ id, title: "" }));
  return {
    id: node.id, title: d.title, method, code, status: d.status, startsAt: d.startsAt, endsAt: d.endsAt, functionId: d.appDiscountType?.functionId,
    form: {
      title: d.title, method, code, valueType: cfg.valueType, value: Number(cfg.value),
      excludedProducts, excludedCollections, excludedTags: vars.excludedTags || [],
      minSubtotal: cfg.minSubtotal ?? null, message: cfg.message || "", startsAt: d.startsAt, endsAt: d.endsAt,
      combinesWith: d.combinesWith,
    },
  };
}

export async function listDiscounts(env: Env, session: Session): Promise<DiscountRow[]> {
  const d = await gql(env, session, `query List { discountNodes(first: 100, query: "type:app", sortKey: CREATED_AT, reverse: true) { nodes { ${DISCOUNT_FIELDS} } } }`);
  return (d.discountNodes.nodes as any[]).map(toRow).filter((r): r is DiscountRow => !!r);
}

export async function getDiscount(env: Env, session: Session, id: string): Promise<DiscountRow | null> {
  const d = await gql(env, session, `query One($id: ID!) { discountNode(id: $id) { ${DISCOUNT_FIELDS} } }`, { id });
  return d.discountNode ? toRow(d.discountNode) : null;
}

export async function setStatus(env: Env, session: Session, id: string, action: "activate" | "deactivate" | "delete"): Promise<void> {
  const row = await getDiscount(env, session, id);
  if (!row) throw new HttpError(404, "Discount not found");
  const kind = row.method === "code" ? "discountCode" : "discountAutomatic";
  const name = `${kind}${action[0].toUpperCase()}${action.slice(1)}`;
  const d = await gql(env, session, `mutation Act($id: ID!) { ${name}(id: $id) { userErrors { field message } } }`, { id });
  userErrors(d[name], `Could not ${action} discount`);
}
