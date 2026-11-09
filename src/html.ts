const CSS = `
:root{--bg:#f1f2f4;--card:#fff;--fg:#303030;--muted:#616161;--line:#e3e3e3;--accent:#303030;--ok:#1f6f4a;--warn:#b98900;--bad:#c5280c}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
main{max-width:900px;margin:0 auto;padding:16px}h1{font-size:20px;margin:8px 0 16px}h2{font-size:15px;margin:0 0 10px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin-bottom:16px;box-shadow:0 1px 0 rgba(0,0,0,.04)}
label{display:block;font-weight:600;margin:10px 0 4px}input[type=text],input[type=number],input[type=datetime-local],select{width:100%;padding:8px 10px;border:1px solid #8a8a8a;border-radius:8px;font:inherit;background:#fff}
.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}@media(max-width:600px){.row{grid-template-columns:1fr}}
button{font:inherit;padding:8px 14px;border-radius:8px;border:1px solid #8a8a8a;background:#fff;cursor:pointer}button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}button.danger{color:var(--bad);border-color:var(--bad)}button:disabled{opacity:.5;cursor:default}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.chip{background:#f1f1f1;border-radius:999px;padding:3px 10px;font-size:13px}.chip b{cursor:pointer;margin-left:6px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line);vertical-align:top}th{color:var(--muted);font-weight:600;font-size:13px}
.status{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;background:#f1f1f1}.status.ACTIVE{background:#e3f1df;color:var(--ok)}.status.EXPIRED,.status.SCHEDULED{background:#fff5d6;color:var(--warn)}
.muted{color:var(--muted)}.actions{display:flex;gap:8px;flex-wrap:wrap}.error{background:#fde7e3;color:var(--bad);padding:10px 12px;border-radius:8px;margin-bottom:12px}.hidden{display:none}
.help{color:var(--muted);font-size:13px;margin-top:2px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
`;

const CLIENT = `
const $ = (s, el=document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path, opts={}) {
  const token = await shopify.idToken();
  const res = await fetch(path, { ...opts, headers: { "content-type": "application/json", authorization: "Bearer " + token, ...(opts.headers||{}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || ("Request failed (" + res.status + ")"));
  return body;
}
const state = { functionId: new URLSearchParams(location.search).get("functionId") || "", editing: null, form: null, saving: false };
const blank = () => ({ title: "", method: "automatic", code: "", valueType: "percentage", value: "", excludedProducts: [], excludedCollections: [], excludedTags: [], minSubtotal: "", message: "", startsAt: "", endsAt: "", combinesWith: { orderDiscounts: false, productDiscounts: false, shippingDiscounts: true } });
function route() {
  const m = location.pathname.match(/^\\/app\\/discounts\\/(new|[^/]+)$/);
  if (!m) return { page: "list" };
  if (m[1] === "new") return { page: "form", id: null };
  return { page: "form", id: decodeURIComponent(m[1]) };
}
function fmtValue(f) { return f.valueType === "fixedAmount" ? "$" + Number(f.value).toFixed(2) + " off" : Number(f.value) + "% off"; }
function exclusions(f) { const n = (f.excludedProducts||[]).length + (f.excludedCollections||[]).length + (f.excludedTags||[]).length; return n ? n + " exclusion" + (n===1?"":"s") : "none"; }
async function renderList() {
  const main = $("main");
  main.innerHTML = '<div class="topbar"><h1>Discount Excluder</h1><button class="primary" id="new">Create discount</button></div><div class="card"><p class="muted">Loading discounts…</p></div>';
  $("#new").onclick = () => navigate("/app/discounts/new");
  try {
    const { discounts } = await api("/api/discounts");
    const card = $(".card");
    if (!discounts.length) { card.innerHTML = '<h2>No discounts yet</h2><p>Create a discount that applies to everything except the products, collections, or tags you choose.</p><p class="help">Tip: you can also start from Shopify admin > Discounts > Create discount > Discount Excluder.</p>'; return; }
    card.innerHTML = '<table><thead><tr><th>Discount</th><th>Value</th><th>Excludes</th><th>Status</th><th></th></tr></thead><tbody>' + discounts.map((d) =>
      '<tr><td><b>' + esc(d.title) + '</b><div class="muted">' + (d.method === "code" ? "Code: " + esc(d.code) : "Automatic") + '</div></td><td>' + esc(fmtValue(d.form)) + '</td><td>' + esc(exclusions(d.form)) + '</td><td><span class="status ' + esc(d.status) + '">' + esc(d.status) + '</span></td><td class="actions">' +
      '<button data-edit="' + esc(d.id) + '">Edit</button>' + (d.status === "ACTIVE" ? '<button data-act="deactivate" data-id="' + esc(d.id) + '">Deactivate</button>' : '<button data-act="activate" data-id="' + esc(d.id) + '">Activate</button>') + '<button class="danger" data-act="delete" data-id="' + esc(d.id) + '">Delete</button></td></tr>').join("") + '</tbody></table>';
    card.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => navigate("/app/discounts/" + encodeURIComponent(b.dataset.edit)));
    card.querySelectorAll("[data-act]").forEach((b) => b.onclick = async () => {
      if (b.dataset.act === "delete" && !confirm("Delete this discount? This cannot be undone.")) return;
      b.disabled = true;
      try { await api("/api/discounts/" + encodeURIComponent(b.dataset.id) + "/" + b.dataset.act, { method: "POST" }); shopify.toast.show("Discount " + b.dataset.act + "d"); renderList(); }
      catch (e) { shopify.toast.show(e.message, { isError: true }); b.disabled = false; }
    });
  } catch (e) { $(".card").innerHTML = '<div class="error">' + esc(e.message) + '</div>'; }
}
function chipList(list, key) { return '<div class="chips" data-chips="' + key + '">' + list.map((r, i) => '<span class="chip">' + esc(r.title || r.id || r) + '<b data-rm="' + i + '">×</b></span>').join("") + '</div>'; }
function toLocal(iso) { if (!iso) return ""; const d = new Date(iso); const p = (n) => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth()+1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes()); }
async function renderForm(id) {
  const main = $("main");
  main.innerHTML = '<div class="topbar"><h1>' + (id ? "Edit discount" : "Create discount") + '</h1><button id="back">Back</button></div><div class="card"><p class="muted">Loading…</p></div>';
  $("#back").onclick = () => navigate("/app/discounts");
  try {
    if (id) { const { discount } = await api("/api/discounts/" + encodeURIComponent(id)); state.form = { ...blank(), ...discount.form, startsAt: toLocal(discount.form.startsAt), endsAt: toLocal(discount.form.endsAt) }; }
    else state.form = blank();
    state.editing = id; drawForm();
  } catch (e) { $(".card").innerHTML = '<div class="error">' + esc(e.message) + '</div>'; }
}
function drawForm() {
  const f = state.form; const card = $(".card");
  card.innerHTML = '<div id="err" class="error hidden"></div>' +
    '<label>Title (shown to customers at checkout)</label><input type="text" id="title" value="' + esc(f.title) + '" placeholder="20% off everything except sale items">' +
    '<div class="row"><div><label>Method</label><select id="method"' + (state.editing ? " disabled" : "") + '><option value="automatic"' + (f.method==="automatic"?" selected":"") + '>Automatic discount</option><option value="code"' + (f.method==="code"?" selected":"") + '>Discount code</option></select></div>' +
    '<div id="codeWrap" class="' + (f.method==="code"?"":"hidden") + '"><label>Code</label><input type="text" id="code" value="' + esc(f.code||"") + '" placeholder="SPRING20"></div></div>' +
    '<div class="row"><div><label>Discount type</label><select id="valueType"><option value="percentage"' + (f.valueType==="percentage"?" selected":"") + '>Percentage</option><option value="fixedAmount"' + (f.valueType==="fixedAmount"?" selected":"") + '>Fixed amount (spread across eligible items)</option></select></div>' +
    '<div><label>Value</label><input type="number" id="value" min="0" step="0.01" value="' + esc(f.value) + '"></div></div>' +
    '<h2 style="margin-top:18px">Exclude from this discount</h2>' +
    '<label>Products</label><button id="pickProducts">Choose products</button>' + chipList(f.excludedProducts, "excludedProducts") +
    '<label>Collections</label><button id="pickCollections">Choose collections</button>' + chipList(f.excludedCollections, "excludedCollections") +
    '<label>Tags</label><input type="text" id="tags" value="' + esc((f.excludedTags||[]).join(", ")) + '" placeholder="sale, clearance"><div class="help">Comma-separated. Tags are matched exactly, including capitalization.</div>' +
    '<h2 style="margin-top:18px">Options</h2>' +
    '<div class="row"><div><label>Minimum subtotal (optional)</label><input type="number" id="minSubtotal" min="0" step="0.01" value="' + esc(f.minSubtotal ?? "") + '"></div><div><label>Message at checkout (optional)</label><input type="text" id="message" value="' + esc(f.message||"") + '" placeholder="Defaults to the discount value"></div></div>' +
    '<div class="row"><div><label>Starts</label><input type="datetime-local" id="startsAt" value="' + esc(f.startsAt||"") + '"></div><div><label>Ends (optional)</label><input type="datetime-local" id="endsAt" value="' + esc(f.endsAt||"") + '"></div></div>' +
    '<label>Combines with</label><div><label style="font-weight:400"><input type="checkbox" id="cwProduct"' + (f.combinesWith.productDiscounts?" checked":"") + '> Other product discounts</label><label style="font-weight:400"><input type="checkbox" id="cwOrder"' + (f.combinesWith.orderDiscounts?" checked":"") + '> Order discounts</label><label style="font-weight:400"><input type="checkbox" id="cwShipping"' + (f.combinesWith.shippingDiscounts?" checked":"") + '> Shipping discounts</label></div>' +
    '<div class="actions" style="margin-top:18px"><button class="primary" id="save">' + (state.editing ? "Save changes" : "Create discount") + '</button><button id="cancel">Cancel</button></div>';
  $("#method").onchange = (e) => { f.method = e.target.value; $("#codeWrap").classList.toggle("hidden", f.method !== "code"); };
  $("#cancel").onclick = () => navigate("/app/discounts");
  $("#pickProducts").onclick = () => pick("product", "excludedProducts");
  $("#pickCollections").onclick = () => pick("collection", "excludedCollections");
  card.querySelectorAll("[data-chips]").forEach((wrap) => wrap.querySelectorAll("[data-rm]").forEach((x) => x.onclick = () => { readForm(); f[wrap.dataset.chips].splice(Number(x.dataset.rm), 1); drawForm(); }));
  $("#save").onclick = save;
}
function readForm() {
  const f = state.form;
  f.title = $("#title").value; f.method = $("#method").value; f.code = $("#code").value; f.valueType = $("#valueType").value; f.value = $("#value").value;
  f.excludedTags = $("#tags").value.split(",").map((t) => t.trim()).filter(Boolean);
  f.minSubtotal = $("#minSubtotal").value; f.message = $("#message").value; f.startsAt = $("#startsAt").value; f.endsAt = $("#endsAt").value;
  f.combinesWith = { productDiscounts: $("#cwProduct").checked, orderDiscounts: $("#cwOrder").checked, shippingDiscounts: $("#cwShipping").checked };
}
async function pick(type, key) {
  readForm();
  const current = state.form[key].map((r) => ({ id: r.id }));
  const selected = await shopify.resourcePicker({ type, multiple: true, action: "select", selectionIds: current });
  if (!selected) return;
  state.form[key] = selected.map((r) => ({ id: r.id, title: r.title }));
  drawForm();
}
async function save() {
  readForm(); const f = state.form; const btn = $("#save"); btn.disabled = true; $("#err").classList.add("hidden");
  try {
    const payload = { ...f, startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : "", endsAt: f.endsAt ? new Date(f.endsAt).toISOString() : "" };
    if (state.editing) await api("/api/discounts/" + encodeURIComponent(state.editing), { method: "PUT", body: JSON.stringify(payload) });
    else await api("/api/discounts", { method: "POST", body: JSON.stringify(payload) });
    shopify.toast.show("Discount saved"); navigate("/app/discounts");
  } catch (e) { const el = $("#err"); el.textContent = e.message; el.classList.remove("hidden"); btn.disabled = false; window.scrollTo(0, 0); }
}
function navigate(path) { history.pushState({}, "", path + location.search.replace(/[?&]functionId=[^&]*/, "").replace(/^&/, "?")); render(); }
window.addEventListener("popstate", render);
async function render() { const r = route(); if (r.page === "form") renderForm(r.id); else renderList(); }
(async function boot() {
  try {
    const b = await api("/api/bootstrap");
    if (b.billing && !b.billing.active) { $("main").innerHTML = '<div class="card"><h2>Start your 7-day free trial</h2><p>Discount Excluder is $4.99/month after the trial. Approve the subscription in Shopify to continue.</p><p><button class="primary" id="approve">Approve subscription</button></p></div>'; $("#approve").onclick = () => open(b.billing.confirmationUrl, "_top"); return; }
  } catch (e) { $("main").innerHTML = '<div class="card"><div class="error">' + esc(e.message) + '</div><p class="help">If this keeps happening, open the app from Shopify admin > Apps.</p></div>'; return; }
  render();
})();
`;

export function appShell(apiKey: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="shopify-api-key" content="${apiKey}"><script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
<title>Discount Excluder Example</title><style>${CSS}</style></head><body><main><div class="card"><p class="muted">Loading…</p></div></main>
<script>${CLIENT}</script></body></html>`;
}

export function staticPage(title: string, body: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Discount Excluder</title><style>${CSS} main{max-width:720px} p,li{line-height:1.6}</style></head><body><main><h1>${title}</h1>${body}<p class="muted">Discount Excluder is made by YOUR COMPANY, a small software company operated by AI agents and owned by a person. Support: support@example.com</p></main></body></html>`;
}

export const PRIVACY = `
<p>Last updated 2026-11-04.</p>
<h2>What we collect</h2><p>When you install Discount Excluder we store your shop's myshopify domain and an access token so the app can create and manage its own discounts, and the discount settings you enter (which products, collections, or tags to exclude). We do not collect, store, or process customer personal data; the discount rule runs inside Shopify checkout and never sends cart or customer data to our servers.</p>
<h2>How we use it</h2><p>Only to provide the app. We never sell or share data with third parties. Hosting: Cloudflare (United States).</p>
<h2>Retention and deletion</h2><p>When you uninstall the app your access token is deleted immediately and all stored settings within 48 hours. Shopify deletes the discounts the app created. We honor Shopify's mandatory privacy webhooks (customers/data_request, customers/redact, shop/redact); because we hold no customer data, data requests return nothing and redaction completes immediately.</p>
<h2>Contact</h2><p>support@example.com. Controller: YOUR COMPANY NAME AND COUNTRY.</p>`;

export const SUPPORT = `
<p>Email <a href="mailto:support@example.com">support@example.com</a>. We answer within 24 hours. Refunds within 14 days of a charge are given on request, no questions asked.</p>
<h2>Common questions</h2>
<ul>
<li><b>My exclusion isn't working.</b> Tags are matched exactly (including capitalization); collection exclusions need a real collection; automatic discounts only combine with other discounts when the discount's combination settings allow it; try a fresh cart after changing settings.</li>
<li><b>Does it work with codes and automatic discounts?</b> Yes, choose the method when creating the discount.</li>
<li><b>Does it slow checkout?</b> No. The rule runs inside Shopify checkout as a Shopify Function.</li>
<li><b>How do I cancel?</b> Uninstall the app from Shopify admin. Billing stops immediately.</li>
</ul>`;
