import "@shopify/shopify-api/adapters/cf-worker";
import { shopifyApi, ApiVersion, Session, RequestedTokenType, type Shopify } from "@shopify/shopify-api";

export type Env = {
  SESSIONS: KVNamespace;
  SHOPIFY_API_KEY: string;
  SHOPIFY_API_SECRET: string;
  SHOPIFY_APP_URL: string;
  SHOPIFY_APP_HANDLE?: string;
};

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let cached: Shopify | undefined;
export function getShopify(env: Env): Shopify {
  if (cached) return cached;
  cached = shopifyApi({
    apiKey: env.SHOPIFY_API_KEY,
    apiSecretKey: env.SHOPIFY_API_SECRET,
    apiVersion: ApiVersion.April26,
    hostName: new URL(env.SHOPIFY_APP_URL).host,
    isEmbeddedApp: true,
    future: {},
  });
  return cached;
}

type StoredSession = { accessToken: string; scope?: string; expires?: string | null };

/** Verifies the App Bridge session token on the request and returns an offline Admin API session for that shop. */
export async function authenticate(env: Env, request: Request): Promise<{ shop: string; session: Session }> {
  const header = request.headers.get("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "Missing session token");
  const shopify = getShopify(env);
  let payload;
  try {
    payload = await shopify.session.decodeSessionToken(token);
  } catch {
    throw new HttpError(401, "Invalid session token");
  }
  const shop = shopify.utils.sanitizeShop(payload.dest.replace(/^https?:\/\//, ""), true)!;
  const key = `offline:${shop}`;
  const stored = (await env.SESSIONS.get(key, "json")) as StoredSession | null;
  if (stored?.accessToken && (!stored.expires || Date.parse(stored.expires) > Date.now() + 5 * 60_000)) {
    return { shop, session: new Session({ id: key, shop, state: "", isOnline: false, accessToken: stored.accessToken, scope: stored.scope }) };
  }
  let session: Session;
  try {
    ({ session } = await shopify.auth.tokenExchange({ shop, sessionToken: token, requestedTokenType: RequestedTokenType.OfflineAccessToken, expiring: true }));
  } catch (e: any) { e.step = "tokenExchange"; throw e; }
  const record: StoredSession = { accessToken: session.accessToken!, scope: session.scope, expires: session.expires ? session.expires.toISOString() : null };
  const ttl = session.expires ? Math.max(60, Math.min(60 * 60 * 23, Math.floor((session.expires.getTime() - Date.now()) / 1000) - 300)) : 60 * 60 * 23;
  await env.SESSIONS.put(key, JSON.stringify(record), { expirationTtl: ttl });
  return { shop, session };
}

export async function forgetShop(env: Env, shop: string) {
  await env.SESSIONS.delete(`offline:${shop}`);
}

/** Runs an Admin GraphQL operation and returns `data`, throwing on transport or userErrors-free GraphQL errors. */
export async function gql<T = any>(env: Env, session: Session, query: string, variables?: Record<string, unknown>): Promise<T> {
  const shopify = getShopify(env);
  const client = new shopify.clients.Graphql({ session });
  let res: any;
  try { res = await client.request(query, { variables }); } catch (e: any) { e.step = "graphql:" + query.trim().slice(0, 40); throw e; }
  if (res.errors) throw new HttpError(502, `Shopify API error: ${JSON.stringify(res.errors).slice(0, 500)}`);
  return res.data as T;
}
