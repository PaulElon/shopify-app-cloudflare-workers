import { Hono } from "hono";
import { authenticate, HttpError, type Env } from "./shopify";
import { createDiscount, getDiscount, listDiscounts, setStatus, updateDiscount, validateForm } from "./discounts";
import { ensureSubscription, requireActiveSubscription } from "./billing";
import { handleWebhook } from "./webhooks";
import { appShell, staticPage, PRIVACY, SUPPORT } from "./html";

const app = new Hono<{ Bindings: Env }>();

function frameHeaders(c: any, shop?: string | null) {
  // Shopify requires the exact shop domain plus admin.shopify.com; no wildcards.
  const ancestors = ["https://admin.shopify.com"];
  if (shop && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(shop)) ancestors.unshift(`https://${shop}`);
  c.header("Content-Security-Policy", `frame-ancestors ${ancestors.join(" ")};`);
}

const keepQuery = (c: any) => { const i = c.req.url.indexOf("?"); return i >= 0 ? c.req.url.slice(i) : ""; };
app.get("/", (c) => c.redirect("/app/discounts" + keepQuery(c)));
app.get("/app", (c) => c.redirect("/app/discounts" + keepQuery(c)));
app.get("/app/discounts", (c) => { frameHeaders(c, c.req.query("shop")); return c.html(appShell(c.env.SHOPIFY_API_KEY)); });
app.get("/app/discounts/:id", (c) => { frameHeaders(c, c.req.query("shop")); return c.html(appShell(c.env.SHOPIFY_API_KEY)); });
app.get("/auth/callback", (c) => c.redirect("/app/discounts"));
app.get("/privacy", (c) => c.html(staticPage("Privacy policy", PRIVACY)));
app.get("/support", (c) => c.html(staticPage("Support", SUPPORT)));
app.get("/health", (c) => c.json({ ok: true }));

app.post("/webhooks/*", (c) => handleWebhook(c.env, c.req.raw));

app.get("/api/bootstrap", async (c) => {
  const { shop, session } = await authenticate(c.env, c.req.raw);
  const billing = await ensureSubscription(c.env, session, shop);
  return c.json({ shop, billing });
});
app.get("/api/discounts", async (c) => {
  const { session } = await authenticate(c.env, c.req.raw);
  return c.json({ discounts: await listDiscounts(c.env, session) });
});
app.get("/api/discounts/:id", async (c) => {
  const { session } = await authenticate(c.env, c.req.raw);
  const discount = await getDiscount(c.env, session, c.req.param("id"));
  if (!discount) throw new HttpError(404, "Discount not found");
  return c.json({ discount });
});
app.post("/api/discounts", async (c) => {
  const { shop, session } = await authenticate(c.env, c.req.raw);
  await requireActiveSubscription(c.env, session, shop);
  const form = validateForm(await c.req.json());
  const id = await createDiscount(c.env, session, form);
  return c.json({ id });
});
app.put("/api/discounts/:id", async (c) => {
  const { shop, session } = await authenticate(c.env, c.req.raw);
  await requireActiveSubscription(c.env, session, shop);
  const form = validateForm(await c.req.json());
  await updateDiscount(c.env, session, c.req.param("id"), form);
  return c.json({ ok: true });
});
app.post("/api/discounts/:id/:action{activate|deactivate|delete}", async (c) => {
  const { shop, session } = await authenticate(c.env, c.req.raw);
  await requireActiveSubscription(c.env, session, shop);
  await setStatus(c.env, session, c.req.param("id"), c.req.param("action") as any);
  return c.json({ ok: true });
});

app.onError((err, c) => {
  const status = err instanceof HttpError ? err.status : 500;
  if (status >= 500) {
    const r: any = (err as any).response;
    console.error("unhandled", JSON.stringify({ message: err.message, step: (err as any).step, code: r?.code, statusText: r?.statusText, body: typeof r?.body === "string" ? r.body.slice(0, 800) : r?.body, path: c.req.path }));
  }
  return c.json({ error: status >= 500 ? "Something went wrong. Please try again." : err.message }, status as any);
});

export default app;
