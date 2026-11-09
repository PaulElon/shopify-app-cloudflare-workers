import type { Session } from "@shopify/shopify-api";
import { gql, HttpError, type Env } from "./shopify";

export const PLAN_NAME = "Discount Excluder";
export const PRICE_USD = 4.99;
export const TRIAL_DAYS = 7;

export type BillingState = { active: true } | { active: false; confirmationUrl: string };

export async function ensureSubscription(env: Env, session: Session, shop: string): Promise<BillingState> {
  const d = await gql(env, session, `query Billing {
    currentAppInstallation { activeSubscriptions { id status name test } }
    shop { plan { partnerDevelopment } }
  }`);
  const subs = (d.currentAppInstallation?.activeSubscriptions || []) as any[];
  if (subs.some((s) => s.status === "ACTIVE")) {
    await env.SESSIONS.put(`billing:${shop}`, "active", { expirationTtl: 10 * 60 });
    return { active: true };
  }
  // Shopify App Pricing (managed pricing) is enabled for this app: plans live in the Partner Dashboard and
  // merchants pick one on Shopify's own plan-selection page, which handles trials and test charges.
  if (env.SHOPIFY_APP_HANDLE) {
    const storeHandle = shop.replace(/\.myshopify\.com$/i, "");
    return { active: false, confirmationUrl: `https://admin.shopify.com/store/${storeHandle}/charges/${env.SHOPIFY_APP_HANDLE}/pricing_plans` };
  }
  // Fallback for environments without managed pricing: create the subscription through the Billing API.
  const test = !!d.shop?.plan?.partnerDevelopment;
  const returnUrl = `https://${shop}/admin/apps/${env.SHOPIFY_API_KEY}/app/discounts`;
  const m = await gql(env, session, `mutation Subscribe($name: String!, $returnUrl: URL!, $test: Boolean!, $trialDays: Int!, $lineItems: [AppSubscriptionLineItemInput!]!) {
    appSubscriptionCreate(name: $name, returnUrl: $returnUrl, test: $test, trialDays: $trialDays, lineItems: $lineItems) {
      confirmationUrl userErrors { field message } } }`, {
    name: PLAN_NAME, returnUrl, test, trialDays: TRIAL_DAYS,
    lineItems: [{ plan: { appRecurringPricingDetails: { price: { amount: PRICE_USD, currencyCode: "USD" }, interval: "EVERY_30_DAYS" } } }],
  });
  const errs = m.appSubscriptionCreate?.userErrors;
  if (errs?.length) throw new Error(`Billing error: ${errs.map((e: any) => e.message).join("; ")}`);
  return { active: false, confirmationUrl: m.appSubscriptionCreate.confirmationUrl };
}

/** Server-side gate for every route that changes data: 402 unless the shop has an ACTIVE subscription (10-minute KV cache). */
export async function requireActiveSubscription(env: Env, session: Session, shop: string): Promise<void> {
  if ((await env.SESSIONS.get(`billing:${shop}`)) === "active") return;
  const d = await gql(env, session, `query BillingCheck { currentAppInstallation { activeSubscriptions { status } } }`);
  const subs = (d.currentAppInstallation?.activeSubscriptions || []) as any[];
  if (!subs.some((s) => s.status === "ACTIVE")) throw new HttpError(402, "An active subscription is required. Open the app from Shopify admin to start your free trial.");
  await env.SESSIONS.put(`billing:${shop}`, "active", { expirationTtl: 10 * 60 });
}
