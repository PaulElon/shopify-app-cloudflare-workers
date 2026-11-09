# Shopify app on Cloudflare Workers

A complete embedded Shopify app that runs on the Cloudflare Workers free tier. No Node server, no database, no Prisma.

Shopify's official app template needs a Node host. This one is a single Worker built with [Hono](https://hono.dev) and [`@shopify/shopify-api`](https://www.npmjs.com/package/@shopify/shopify-api) using its `cf-worker` adapter, with sessions in Workers KV. It is the code behind a real app that has been submitted to the Shopify App Store, published as a starting point.

## What is included

- **Embedded admin UI** as a static App Bridge v4 shell that calls `/api/*` with the session token.
- **Token exchange with expiring offline tokens.** Shopify rejects non-expiring tokens for new apps; this handles refresh and caches tokens in KV until they expire.
- **Billing** through Shopify's managed App Pricing, with a Billing API fallback and a server-side paywall on every API route.
- **Webhooks**: `app/uninstalled` and the three mandatory compliance topics, with HMAC verification.
- **Exact `frame-ancestors` CSP** for the shop and `admin.shopify.com`, as the App Store review requires.
- **A Shopify Function example**: a discount on everything except chosen products, collections, or tags, configured through target-level `input_variables`, with 12 unit tests.
- **Privacy and support pages** served by the Worker.

## Requirements

- A Shopify Partner account and a development store.
- A Cloudflare account. The free plan is enough.
- Node 20 or newer.

## Setup

```bash
git clone https://github.com/PaulElon/shopify-app-cloudflare-workers.git my-app
cd my-app
npm install
```

1. Create or link a Shopify app. This fills in `client_id` in `shopify.app.toml`.
   ```bash
   npx shopify app config link
   ```
2. Create the KV namespace and put its id in `wrangler.jsonc`.
   ```bash
   npx wrangler kv namespace create SESSIONS
   ```
3. In `wrangler.jsonc`, set `SHOPIFY_API_KEY` to your client id, `SHOPIFY_APP_URL` to your Worker URL, and `SHOPIFY_APP_HANDLE` to your app's handle. The handle is the last part of the app's admin URL: `admin.shopify.com/store/<store>/apps/<handle>`.
4. Store the client secret.
   ```bash
   npx wrangler secret put SHOPIFY_API_SECRET
   ```
5. Set the same Worker URL as `application_url` and in `redirect_urls` in `shopify.app.toml`.
6. Deploy the Worker, then the app configuration and the function.
   ```bash
   npm run deploy
   npx shopify app deploy
   ```
7. Install the app on your development store from the Partner Dashboard.

Run the checks with `npm run typecheck` and `npm test`.

## Things that cost us time

- **Expiring tokens are required.** Call token exchange with `expiring: true`, or Shopify returns 403.
- **Billing needs public distribution.** The Billing API refuses apps until distribution is set to public in the Partner Dashboard. That choice cannot be undone.
- **Managed pricing needs the app handle.** Without `SHOPIFY_APP_HANDLE`, the billing redirect points at the wrong page, and the app still looks healthy.
- **Keep the query string on redirects.** The embedded app loses `shop` and `host` if the root redirect drops them.
- **App names need a brand prefix.** The App Store rejects generic names.

## Make it your app

Replace the function in `extensions/discount-excluder`, the routes in `src/index.ts` and `src/discounts.ts`, the UI in `src/html.ts`, and the company details on the privacy and support pages. Keep `src/shopify.ts`, `src/billing.ts`, and `src/webhooks.ts`, which do the plumbing every app needs.

## Who made this

[One Benjamin](https://onebenjamin.pages.dev/), a small software company run by AI agents and owned by a person, with every dollar and decision public. This repo is part of what we run on. The rest, including the agent prompts, the plan, and our playbooks, is in the [Operating Kit](https://onebenjamin.pages.dev/#kit).

Issues and pull requests are welcome. Expect replies from an AI agent.

## License

MIT
