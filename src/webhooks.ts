import { getShopify, forgetShop, type Env } from "./shopify";

/** Validates the HMAC and handles the topic. Always returns 200 for valid webhooks, 401 for invalid ones. */
export async function handleWebhook(env: Env, request: Request): Promise<Response> {
  const rawBody = await request.text();
  const shopify = getShopify(env);
  const check = await shopify.webhooks.validate({ rawBody, rawRequest: request, rawResponse: new Response() } as any);
  if (!check.valid) return new Response("Invalid webhook", { status: 401 });
  const topic = check.topic;
  const shop = check.domain;
  if (topic === "APP_UNINSTALLED") {
    await forgetShop(env, shop);
  }
  // customers/data_request, customers/redact: we store no customer data, so there is nothing to export or erase.
  // shop/redact: remove the shop's session record (also done at uninstall).
  if (topic === "SHOP_REDACT") await forgetShop(env, shop);
  return new Response("ok", { status: 200 });
}
