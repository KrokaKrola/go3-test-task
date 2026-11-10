'use strict';

/**
 * Nordlight mock backend.
 *
 * Zero dependencies, Node 18+. Simulates the backend API, the hosted eID page,
 * the hosted payment page and a headless CMS delivery endpoint, so a frontend
 * can be built and tested locally.
 *
 * Everything is in memory. Restart the server or call POST /__mock/reset to
 * start clean.
 */

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 4010);
const WEB_ORIGIN = process.env.WEB_ORIGIN || 'http://localhost:3000';
const TIME_SCALE = Math.max(1, Number(process.env.MOCK_TIME_SCALE || 1));
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

const SESSION_COOKIE = 'nl_session';
const SCENARIO_COOKIE = 'nl_scenario';
const SESSION_TTL_MS = 60 * 60 * 1000;
const IDENTITY_TTL_MS = 5 * 60 * 1000;

/** Real delays divided by MOCK_TIME_SCALE, so tests can run fast. */
const ms = (n) => Math.round(n / TIME_SCALE);

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const SCENARIOS = {
  happy: 'Everything works. Payment is confirmed about 3 seconds after the customer pays.',
  identity_cancelled: 'The customer cancels at the eID provider.',
  identity_slow: 'The eID provider takes about 8 seconds to answer.',
  rate_limited: 'POST /v1/identity/sessions answers 429 with a Retry-After header.',
  already_subscribed: 'GET /v1/me reports an active subscription.',
  not_trial_eligible: 'GET /v1/me reports trialEligible: false.',
  payment_declined: 'The payment provider declines the payment.',
  payment_slow: 'Payment is confirmed about 45 seconds after the customer pays.',
  payment_requires_action: 'The provider asks for an extra authentication step before it confirms payment.',
  api_500: 'Every /v1 endpoint except GET /v1/plans answers 500.',
};

const VAT = { EE: 0.24, LV: 0.21, LT: 0.21 };

const ALL_PLANS = [
  { id: 'plan_basic_m', name: 'Basic', priceNet: 599 },
  { id: 'plan_std_m', name: 'Standard', priceNet: 899 },
  { id: 'plan_prem_m', name: 'Premium', priceNet: 1299 },
];

const MARKET_PLAN_IDS = {
  EE: ['plan_basic_m', 'plan_std_m', 'plan_prem_m'],
  LT: ['plan_basic_m', 'plan_std_m', 'plan_prem_m'],
  LV: ['plan_basic_m', 'plan_std_m'],
};

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

const state = {
  sessions: new Map(), // sessionId -> { customerId, createdAt }
  customers: new Map(), // customerId -> { id, subscription, trialUsed }
  identitySessions: new Map(), // id -> { id, createdAt, returnUrl, scenario, completed }
  orders: new Map(), // id -> order
};

function resetState() {
  state.sessions.clear();
  state.customers.clear();
  state.identitySessions.clear();
  state.orders.clear();
}

const rid = (prefix, bytes = 6) => `${prefix}_${crypto.randomBytes(bytes).toString('hex')}`;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* ignore malformed cookie */
      }
    }
  }
  return out;
}

function addCookie(res, value) {
  const existing = res.getHeader('Set-Cookie');
  const list = Array.isArray(existing) ? existing : existing ? [existing] : [];
  res.setHeader('Set-Cookie', [...list, value]);
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Identity endpoints answer errors as { error: "message" }. */
const identityError = (res, status, message, headers) => sendJson(res, status, { error: message }, headers);

/** Order endpoints answer errors as { errors: [{ code, message }] }. */
const orderError = (res, status, code, message) => sendJson(res, status, { errors: [{ code, message }] });

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 100 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function isLocalOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function isAllowedOrigin(origin) {
  return Boolean(origin) && (isLocalOrigin(origin) || origin === WEB_ORIGIN || EXTRA_ORIGINS.includes(origin));
}

function isAllowedReturnUrl(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return isAllowedOrigin(u.origin);
  } catch {
    return false;
  }
}

function setCors(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-scenario');
    res.setHeader('Access-Control-Expose-Headers', 'retry-after');
  }
}

function withParams(base, params) {
  const u = new URL(base);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

const selfOrigin = (req) => process.env.MOCK_ORIGIN || `http://${req.headers.host || `localhost:${PORT}`}`;

// ---------------------------------------------------------------------------
// Scenario, session, order helpers
// ---------------------------------------------------------------------------

/** Precedence: x-scenario header, then ?scenario= query, then cookie, then "happy". */
function resolveScenario(req, url, cookies) {
  const name = req.headers['x-scenario'] || url.searchParams.get('scenario') || cookies[SCENARIO_COOKIE] || 'happy';
  return Object.prototype.hasOwnProperty.call(SCENARIOS, name) ? name : null;
}

function getCustomer(ctx) {
  const session = state.sessions.get(ctx.cookies[SESSION_COOKIE]);
  if (!session || Date.now() - session.createdAt > SESSION_TTL_MS) return null;
  const customer = state.customers.get(session.customerId);
  if (!customer) return null;
  applyPaidOrders(customer);
  return customer;
}

function orderStatus(order) {
  if (order.outcome) return Date.now() >= order.settleAt ? order.outcome : 'pending';
  return order.awaitingAction ? 'requires_action' : 'pending';
}

function applyPaidOrders(customer) {
  for (const order of state.orders.values()) {
    if (order.customerId === customer.id && !order.applied && orderStatus(order) === 'paid') {
      order.applied = true;
      customer.trialUsed = true;
      customer.subscription = {
        planId: order.planId,
        status: 'active',
        renewsAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };
    }
  }
}

function orderReturnUrl(order, extra = {}) {
  return withParams(order.returnUrl, { orderId: order.id, ...extra });
}

// ---------------------------------------------------------------------------
// HTML pages for the fake hosted providers
// ---------------------------------------------------------------------------

function providerPage(title, body, script = '') {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
  body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f4f5f7;color:#1b1f24}
  main{max-width:420px;margin:12vh auto;padding:28px;background:#fff;border:1px solid #d8dce1;border-radius:12px}
  h1{font-size:20px;margin:0 0 8px}
  p{margin:0 0 14px}
  .tag{font:12px/1 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.06em;color:#8a4b00;background:#fff1dc;padding:4px 8px;border-radius:999px;display:inline-block;margin-bottom:14px}
  .row{display:flex;gap:10px;margin-top:18px}
  a.btn{flex:1;text-align:center;padding:10px 12px;border-radius:8px;text-decoration:none;border:1px solid #1b1f24;color:#1b1f24}
  a.primary{background:#1b1f24;color:#fff}
  small{color:#5b6570}
</style></head>
<body><main><span class="tag">Mock provider - not real</span>${body}</main>${script ? `<script>${script}</script>` : ''}</body></html>`;
}

function eidPage(idSession, req) {
  const delay = idSession.scenario === 'identity_slow' ? ms(8000) : ms(1500);
  const result = idSession.scenario === 'identity_cancelled' ? 'cancelled' : 'ok';
  const base = `/mock-eid/${encodeURIComponent(idSession.id)}/complete`;
  const message =
    result === 'cancelled'
      ? 'The customer is about to cancel (scenario: identity_cancelled).'
      : 'Waiting for confirmation in the eID app. This continues automatically.';
  return providerPage(
    'Mock eID',
    `<h1>Mock eID provider</h1><p>${esc(message)}</p>
     <p><small>Scenario: ${esc(idSession.scenario)}</small></p>
     <div class="row"><a class="btn primary" href="${base}?result=ok">Confirm now</a><a class="btn" href="${base}?result=cancelled">Cancel</a></div>`,
    `setTimeout(function(){location.href=${JSON.stringify(`${base}?result=${result}`)}},${delay});`,
  );
}

function payPage(order) {
  const base = `/mock-pay/${encodeURIComponent(order.id)}/submit`;
  const plan = ALL_PLANS.find((p) => p.id === order.planId);
  return providerPage(
    'Mock payment',
    `<h1>Mock payment page</h1><p>Order ${esc(order.id)} for ${esc(plan ? plan.name : order.planId)}.</p>
     <p><small>Scenario: ${esc(order.scenario)}. Payment continues automatically.</small></p>
     <div class="row"><a class="btn primary" href="${base}?action=pay">Pay now</a><a class="btn" href="${base}?action=cancel">Cancel</a></div>`,
    `setTimeout(function(){location.href=${JSON.stringify(`${base}?action=pay`)}},${ms(1500)});`,
  );
}

function challengePage(order) {
  const base = `/mock-pay/${encodeURIComponent(order.id)}/challenge/complete`;
  return providerPage(
    'Mock authentication',
    `<h1>Extra authentication required</h1><p>The provider asks the customer to confirm this payment.</p>
     <div class="row"><a class="btn primary" href="${base}?result=approve">Approve</a><a class="btn" href="${base}?result=fail">Fail</a></div>`,
    `setTimeout(function(){location.href=${JSON.stringify(`${base}?result=approve`)}},${ms(1500)});`,
  );
}

function landingPage(req, scenario) {
  const origin = selfOrigin(req);
  const rows = Object.entries(SCENARIOS)
    .map(
      ([name, desc]) =>
        `<tr><td><a href="/__mock/scenario/${name}"><code>${name}</code></a>${name === scenario ? ' (active)' : ''}</td><td>${esc(desc)}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Nordlight mock server</title>
<style>body{font:15px/1.55 system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 16px;color:#1b1f24}
table{border-collapse:collapse;width:100%}td,th{border-top:1px solid #d8dce1;padding:8px;text-align:left;vertical-align:top}
code{background:#eef0f3;padding:1px 5px;border-radius:4px}</style></head><body>
<h1>Nordlight mock server</h1>
<p>Active scenario for this browser: <code>${esc(scenario)}</code>. Click a scenario to switch (sets the <code>${SCENARIO_COOKIE}</code> cookie).</p>
<table><tr><th>Scenario</th><th>Behaviour</th></tr>${rows}</table>
<h2>Endpoints</h2>
<ul>
<li><code>GET ${origin}/v1/plans?market=EE</code></li>
<li><code>POST ${origin}/v1/identity/sessions</code></li>
<li><code>GET ${origin}/v1/me</code></li>
<li><code>POST ${origin}/v1/orders</code></li>
<li><code>GET ${origin}/v1/orders/{id}</code></li>
<li><code>GET ${origin}/cms/v1/plan-pages?market=EE&amp;locale=et</code></li>
<li><code>GET ${origin}/__mock/state</code> and <code>POST ${origin}/__mock/reset</code></li>
</ul></body></html>`;
}

// ---------------------------------------------------------------------------
// Route handlers
// ---------------------------------------------------------------------------

function handlePlans(ctx) {
  const market = (ctx.url.searchParams.get('market') || '').toUpperCase();
  if (!MARKET_PLAN_IDS[market]) return identityError(ctx.res, 400, 'Unknown or missing market. Use EE, LV or LT.');
  const plans = ALL_PLANS.filter((p) => MARKET_PLAN_IDS[market].includes(p.id)).map((p) => ({
    id: p.id,
    name: p.name,
    priceNet: p.priceNet,
    vatRate: VAT[market],
    currency: 'EUR',
  }));
  return sendJson(ctx.res, 200, { market, plans });
}

async function handleCreateIdentitySession(ctx) {
  const { req, res, scenario } = ctx;
  if (scenario === 'api_500') return identityError(res, 500, 'Internal error');
  if (scenario === 'rate_limited') return identityError(res, 429, 'Too many requests', { 'Retry-After': '30' });
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return identityError(res, 400, err.message);
  }
  const returnUrl = body.returnUrl || `${WEB_ORIGIN}/auth/callback`;
  if (!isAllowedReturnUrl(returnUrl)) return identityError(res, 400, 'returnUrl is not allowed');
  const id = rid('ids', 8);
  state.identitySessions.set(id, { id, createdAt: Date.now(), returnUrl, scenario, completed: false });
  return sendJson(res, 201, { sessionId: id, redirectUrl: `${selfOrigin(req)}/mock-eid/${id}` });
}

function handleEidPage(ctx, id) {
  const s = state.identitySessions.get(id);
  if (!s) return sendHtml(ctx.res, 404, providerPage('Not found', '<h1>Unknown eID session</h1>'));
  if (Date.now() - s.createdAt > IDENTITY_TTL_MS) return redirect(ctx.res, withParams(s.returnUrl, { status: 'expired' }));
  return sendHtml(ctx.res, 200, eidPage(s, ctx.req));
}

function handleEidComplete(ctx, id) {
  const { res, url } = ctx;
  const s = state.identitySessions.get(id);
  if (!s) return sendHtml(res, 404, providerPage('Not found', '<h1>Unknown eID session</h1>'));
  if (s.completed || Date.now() - s.createdAt > IDENTITY_TTL_MS) {
    return redirect(res, withParams(s.returnUrl, { status: 'expired' }));
  }
  s.completed = true;
  if (url.searchParams.get('result') !== 'ok') {
    return redirect(res, withParams(s.returnUrl, { status: 'cancelled' }));
  }
  const customerId = rid('cus', 5);
  state.customers.set(customerId, { id: customerId, subscription: null, trialUsed: false });
  const sessionId = rid('ses', 12);
  state.sessions.set(sessionId, { customerId, createdAt: Date.now() });
  addCookie(res, `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`);
  return redirect(res, withParams(s.returnUrl, { status: 'ok' }));
}

function handleMe(ctx) {
  const { res, scenario } = ctx;
  if (scenario === 'api_500') return identityError(res, 500, 'Internal error');
  const customer = getCustomer(ctx);
  if (!customer) return identityError(res, 401, 'Not identified');
  const activeSubscription =
    scenario === 'already_subscribed'
      ? { planId: 'plan_std_m', status: 'active', renewsAt: new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString() }
      : customer.subscription;
  const trialEligible = scenario === 'not_trial_eligible' ? false : !customer.trialUsed;
  return sendJson(res, 200, { customerId: customer.id, activeSubscription, trialEligible });
}

async function handleCreateOrder(ctx) {
  const { req, res, scenario } = ctx;
  if (scenario === 'api_500') return orderError(res, 500, 'internal_error', 'Something went wrong.');
  const customer = getCustomer(ctx);
  if (!customer) return orderError(res, 401, 'unauthenticated', 'Identify yourself first.');
  let body;
  try {
    body = await readJson(req);
  } catch (err) {
    return orderError(res, 400, 'invalid_request', err.message);
  }
  if (!ALL_PLANS.some((p) => p.id === body.planId)) {
    return orderError(res, 400, 'invalid_plan', 'Unknown planId.');
  }
  if (scenario === 'already_subscribed' || customer.subscription) {
    return orderError(res, 409, 'already_subscribed', 'The customer already has an active subscription.');
  }
  const returnUrl = body.returnUrl || `${WEB_ORIGIN}/payment/return`;
  if (!isAllowedReturnUrl(returnUrl)) return orderError(res, 400, 'invalid_request', 'returnUrl is not allowed.');
  const id = rid('ord', 6);
  state.orders.set(id, {
    id,
    customerId: customer.id,
    planId: body.planId,
    createdAt: new Date().toISOString(),
    scenario,
    returnUrl,
    outcome: null, // 'paid' | 'failed'
    settleAt: 0,
    awaitingAction: false,
    applied: false,
  });
  return sendJson(res, 201, { orderId: id, paymentUrl: `${selfOrigin(req)}/mock-pay/${id}` });
}

function handleGetOrder(ctx, id) {
  const { req, res, scenario } = ctx;
  if (scenario === 'api_500') return orderError(res, 500, 'internal_error', 'Something went wrong.');
  const customer = getCustomer(ctx);
  if (!customer) return orderError(res, 401, 'unauthenticated', 'Identify yourself first.');
  const order = state.orders.get(id);
  if (!order || order.customerId !== customer.id) return orderError(res, 404, 'order_not_found', 'Order not found.');
  const status = orderStatus(order);
  const body = { orderId: order.id, planId: order.planId, status, createdAt: order.createdAt };
  if (status === 'requires_action') body.actionUrl = `${selfOrigin(req)}/mock-pay/${order.id}/challenge`;
  return sendJson(res, 200, body);
}

function handlePayPage(ctx, id) {
  const order = state.orders.get(id);
  if (!order) return sendHtml(ctx.res, 404, providerPage('Not found', '<h1>Unknown order</h1>'));
  if (order.outcome) return redirect(ctx.res, orderReturnUrl(order));
  return sendHtml(ctx.res, 200, payPage(order));
}

function handlePaySubmit(ctx, id) {
  const { res, url } = ctx;
  const order = state.orders.get(id);
  if (!order) return sendHtml(res, 404, providerPage('Not found', '<h1>Unknown order</h1>'));
  if (order.outcome) return redirect(res, orderReturnUrl(order));
  if (url.searchParams.get('action') === 'cancel') {
    order.outcome = 'failed';
    order.settleAt = Date.now();
    return redirect(res, orderReturnUrl(order, { cancelled: '1' }));
  }
  switch (order.scenario) {
    case 'payment_declined':
      order.outcome = 'failed';
      order.settleAt = Date.now() + ms(1000);
      break;
    case 'payment_slow':
      order.outcome = 'paid';
      order.settleAt = Date.now() + ms(45000);
      break;
    case 'payment_requires_action':
      order.awaitingAction = true;
      return redirect(res, `/mock-pay/${encodeURIComponent(order.id)}/challenge`);
    default:
      order.outcome = 'paid';
      order.settleAt = Date.now() + ms(3000);
  }
  return redirect(res, orderReturnUrl(order));
}

function handleChallengePage(ctx, id) {
  const order = state.orders.get(id);
  if (!order) return sendHtml(ctx.res, 404, providerPage('Not found', '<h1>Unknown order</h1>'));
  if (order.outcome) return redirect(ctx.res, orderReturnUrl(order));
  return sendHtml(ctx.res, 200, challengePage(order));
}

function handleChallengeComplete(ctx, id) {
  const { res, url } = ctx;
  const order = state.orders.get(id);
  if (!order) return sendHtml(res, 404, providerPage('Not found', '<h1>Unknown order</h1>'));
  if (!order.outcome) {
    order.awaitingAction = false;
    if (url.searchParams.get('result') === 'approve') {
      order.outcome = 'paid';
      order.settleAt = Date.now() + ms(3000);
    } else {
      order.outcome = 'failed';
      order.settleAt = Date.now();
    }
  }
  return redirect(res, orderReturnUrl(order));
}

function handleCms(ctx) {
  const { res, url } = ctx;
  const market = (url.searchParams.get('market') || '').toUpperCase();
  const locale = (url.searchParams.get('locale') || '').toLowerCase();
  if (!/^[A-Z]{2}$/.test(market) || !/^[a-z]{2}$/.test(locale)) {
    return identityError(res, 400, 'market and locale are required');
  }
  const file = path.join(FIXTURES_DIR, 'cms', `plan-page.${market}.${locale}.json`);
  if (!fs.existsSync(file)) return identityError(res, 404, `No PlanPage entry for ${market}/${locale}`);
  return sendJson(res, 200, JSON.parse(fs.readFileSync(file, 'utf8')));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

async function route(ctx) {
  const { req, res, url } = ctx;
  const p = url.pathname.replace(/\/+$/, '') || '/';
  const m = req.method;
  let match;

  if (m === 'GET' && p === '/') return sendHtml(res, 200, landingPage(req, ctx.scenario));
  if (m === 'GET' && p === '/v1/plans') return handlePlans(ctx);
  if (m === 'POST' && p === '/v1/identity/sessions') return handleCreateIdentitySession(ctx);
  if (m === 'GET' && p === '/v1/me') return handleMe(ctx);
  if (m === 'POST' && p === '/v1/orders') return handleCreateOrder(ctx);
  if (m === 'GET' && (match = p.match(/^\/v1\/orders\/([\w-]+)$/))) return handleGetOrder(ctx, match[1]);

  if (m === 'GET' && (match = p.match(/^\/mock-eid\/([\w-]+)$/))) return handleEidPage(ctx, match[1]);
  if (m === 'GET' && (match = p.match(/^\/mock-eid\/([\w-]+)\/complete$/))) return handleEidComplete(ctx, match[1]);
  if (m === 'GET' && (match = p.match(/^\/mock-pay\/([\w-]+)$/))) return handlePayPage(ctx, match[1]);
  if (m === 'GET' && (match = p.match(/^\/mock-pay\/([\w-]+)\/submit$/))) return handlePaySubmit(ctx, match[1]);
  if (m === 'GET' && (match = p.match(/^\/mock-pay\/([\w-]+)\/challenge$/))) return handleChallengePage(ctx, match[1]);
  if (m === 'GET' && (match = p.match(/^\/mock-pay\/([\w-]+)\/challenge\/complete$/))) return handleChallengeComplete(ctx, match[1]);

  if (m === 'GET' && p === '/cms/v1/plan-pages') return handleCms(ctx);

  if (m === 'GET' && (match = p.match(/^\/__mock\/scenario\/([\w]+)$/))) {
    if (!Object.prototype.hasOwnProperty.call(SCENARIOS, match[1])) return identityError(res, 404, 'Unknown scenario');
    addCookie(res, `${SCENARIO_COOKIE}=${match[1]}; Path=/; SameSite=Lax; Max-Age=3600`);
    return redirect(res, '/');
  }
  if ((m === 'POST' || m === 'GET') && p === '/__mock/reset') {
    resetState();
    return m === 'GET' ? redirect(res, '/') : sendJson(res, 200, { ok: true });
  }
  if (m === 'GET' && p === '/__mock/state') {
    return sendJson(res, 200, {
      scenario: ctx.scenario,
      sessions: state.sessions.size,
      customers: [...state.customers.values()],
      identitySessions: state.identitySessions.size,
      orders: [...state.orders.values()].map((o) => ({ id: o.id, planId: o.planId, status: orderStatus(o), scenario: o.scenario })),
    });
  }

  return identityError(res, 404, 'Not found');
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://mock.local');
  setCors(req, res);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const cookies = parseCookies(req);
  const scenario = resolveScenario(req, url, cookies);
  if (!scenario) {
    return identityError(res, 400, `Unknown scenario. Valid: ${Object.keys(SCENARIOS).join(', ')}`);
  }
  if (url.searchParams.get('scenario') && !req.headers['x-scenario']) {
    addCookie(res, `${SCENARIO_COOKIE}=${scenario}; Path=/; SameSite=Lax; Max-Age=3600`);
  }
  const started = Date.now();
  res.on('finish', () => {
    if (!process.env.MOCK_QUIET) {
      console.log(`${req.method} ${url.pathname} [${scenario}] -> ${res.statusCode} (${Date.now() - started}ms)`);
    }
  });
  try {
    await route({ req, res, url, cookies, scenario });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) identityError(res, 500, 'Mock server error');
  }
}

function createServer() {
  return http.createServer((req, res) => {
    handle(req, res);
  });
}

if (require.main === module) {
  const server = createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') console.error(`Port ${PORT} is in use. Set PORT=<other> and try again.`);
    else console.error(err);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log(`Nordlight mock server on http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`);
    console.log(`Web origin for redirects: ${WEB_ORIGIN}   time scale: ${TIME_SCALE}x`);
    console.log('Open the address above to see and switch scenarios.');
  });
}

module.exports = { createServer, resetState, SCENARIOS };
