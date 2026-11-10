'use strict';

// Fast delays and quiet logs. Must be set before the server module loads.
process.env.MOCK_TIME_SCALE = '100';
process.env.MOCK_QUIET = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer, resetState, SCENARIOS } = require('../server');

let server;
let base;

test.before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => new Promise((resolve) => server.close(resolve)));
test.beforeEach(() => resetState());

/** A tiny "browser": keeps cookies between calls. */
function browser() {
  const jar = {};
  const store = (res) => {
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const i = pair.indexOf('=');
      jar[pair.slice(0, i)] = pair.slice(i + 1);
    }
  };
  const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  async function call(path, { method = 'GET', scenario, body, headers = {} } = {}) {
    const res = await fetch(base + path, {
      method,
      redirect: 'manual',
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(scenario ? { 'x-scenario': scenario } : {}),
        ...(cookieHeader() ? { cookie: cookieHeader() } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    store(res);
    return res;
  }
  async function json(path, opts) {
    const res = await call(path, opts);
    return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
  }
  return { call, json, jar };
}

/** Log in through the fake eID page. Returns the browser, ready with a session. */
async function identify(b, scenario) {
  const created = await b.json('/v1/identity/sessions', { method: 'POST', scenario, body: {} });
  assert.equal(created.status, 201);
  const path = new URL(created.body.redirectUrl).pathname;
  const page = await b.call(path);
  assert.equal(page.status, 200);
  const done = await b.call(`${path}/complete?result=ok`);
  assert.equal(done.status, 302);
  assert.match(done.headers.get('location'), /status=ok/);
}

const sleep = (n) => new Promise((r) => setTimeout(r, n));

async function waitForStatus(b, orderId, wanted, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const r = await b.json(`/v1/orders/${orderId}`);
    if (r.body.status === wanted) return r.body;
    await sleep(25);
  }
  throw new Error(`order ${orderId} never reached ${wanted}`);
}

async function startOrder(b, scenario, planId = 'plan_std_m') {
  const r = await b.json('/v1/orders', { method: 'POST', scenario, body: { planId } });
  assert.equal(r.status, 201);
  return r.body;
}

test('lists exactly the ten documented scenarios', () => {
  assert.deepEqual(Object.keys(SCENARIOS).sort(), [
    'already_subscribed', 'api_500', 'happy', 'identity_cancelled', 'identity_slow',
    'not_trial_eligible', 'payment_declined', 'payment_requires_action', 'payment_slow', 'rate_limited',
  ]);
});

test('plans: EE has three, LV has two, unknown market is 400', async () => {
  const b = browser();
  const ee = await b.json('/v1/plans?market=EE');
  assert.equal(ee.body.plans.length, 3);
  assert.equal(ee.body.plans[0].vatRate, 0.24);
  assert.equal(typeof ee.body.plans[0].priceNet, 'number');
  const lv = await b.json('/v1/plans?market=LV');
  assert.equal(lv.body.plans.length, 2);
  const bad = await b.json('/v1/plans?market=FI');
  assert.equal(bad.status, 400);
  assert.ok(bad.body.error);
});

test('cors: local origins get credentialed access, others do not', async () => {
  const b = browser();
  const ok = await b.call('/v1/plans?market=EE', { headers: { origin: 'http://localhost:5173' } });
  assert.equal(ok.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(ok.headers.get('access-control-allow-credentials'), 'true');
  const no = await b.call('/v1/plans?market=EE', { headers: { origin: 'https://evil.example' } });
  assert.equal(no.headers.get('access-control-allow-origin'), null);
  const pre = await b.call('/v1/orders', { method: 'OPTIONS', headers: { origin: 'http://localhost:3000' } });
  assert.equal(pre.status, 204);
});

test('scenario precedence: header, then query, then cookie; unknown is 400', async () => {
  const b = browser();
  const q = await b.json('/v1/plans?market=EE&scenario=api_500');
  assert.equal(q.status, 200); // plans are exempt from api_500
  const me1 = await b.json('/v1/me', { scenario: 'api_500' });
  assert.equal(me1.status, 500);
  // query sets a cookie that sticks
  await b.call('/v1/plans?market=EE&scenario=api_500');
  const me2 = await b.json('/v1/me');
  assert.equal(me2.status, 500);
  // header wins over the cookie
  const me3 = await b.json('/v1/me', { scenario: 'happy' });
  assert.equal(me3.status, 401);
  const bad = await b.json('/v1/me', { scenario: 'nope' });
  assert.equal(bad.status, 400);
});

test('me is 401 without a session, using the identity error shape', async () => {
  const r = await browser().json('/v1/me');
  assert.equal(r.status, 401);
  assert.deepEqual(Object.keys(r.body), ['error']);
});

test('happy path: identify, order, pay, poll to paid, subscription appears', async () => {
  const b = browser();
  await identify(b);
  const me = await b.json('/v1/me');
  assert.equal(me.body.trialEligible, true);
  assert.equal(me.body.activeSubscription, null);

  const order = await startOrder(b);
  assert.match(order.paymentUrl, /\/mock-pay\//);
  assert.equal((await b.json(`/v1/orders/${order.orderId}`)).body.status, 'pending');

  const payPath = new URL(order.paymentUrl).pathname;
  assert.equal((await b.call(payPath)).status, 200);
  const submit = await b.call(`${payPath}/submit?action=pay`);
  assert.equal(submit.status, 302);
  const back = new URL(submit.headers.get('location'));
  assert.equal(back.searchParams.get('orderId'), order.orderId);
  assert.equal(back.searchParams.get('status'), null); // returning is not proof of payment

  const paid = await waitForStatus(b, order.orderId, 'paid');
  assert.equal(paid.planId, 'plan_std_m');
  const after = await b.json('/v1/me');
  assert.equal(after.body.activeSubscription.planId, 'plan_std_m');
  assert.equal(after.body.trialEligible, false);

  const again = await b.json('/v1/orders', { method: 'POST', body: { planId: 'plan_prem_m' } });
  assert.equal(again.status, 409);
  assert.equal(again.body.errors[0].code, 'already_subscribed');
});

test('orders use the errors[] shape and validate input', async () => {
  const b = browser();
  const unauth = await b.json('/v1/orders', { method: 'POST', body: { planId: 'plan_std_m' } });
  assert.equal(unauth.status, 401);
  assert.ok(Array.isArray(unauth.body.errors));
  await identify(b);
  const bad = await b.json('/v1/orders', { method: 'POST', body: { planId: 'plan_gold' } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.errors[0].code, 'invalid_plan');
  const missing = await b.json('/v1/orders/ord_missing');
  assert.equal(missing.status, 404);
});

test('orders are only visible to the customer who made them', async () => {
  const a = browser();
  const other = browser();
  await identify(a);
  await identify(other);
  const order = await startOrder(a);
  const peek = await other.json(`/v1/orders/${order.orderId}`);
  assert.equal(peek.status, 404);
});

test('identity: rate_limited gives 429 with Retry-After', async () => {
  const r = await browser().json('/v1/identity/sessions', { method: 'POST', scenario: 'rate_limited', body: {} });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('retry-after'), '30');
  assert.ok(r.body.error);
});

test('identity: disallowed returnUrl is rejected', async () => {
  const r = await browser().json('/v1/identity/sessions', { method: 'POST', body: { returnUrl: 'https://evil.example/cb' } });
  assert.equal(r.status, 400);
});

test('identity: cancelled and replayed sessions redirect with the right status', async () => {
  const b = browser();
  const created = await b.json('/v1/identity/sessions', { method: 'POST', scenario: 'identity_cancelled', body: {} });
  const path = new URL(created.body.redirectUrl).pathname;
  const page = await (await b.call(path)).text();
  assert.match(page, /result=cancelled/);
  const done = await b.call(`${path}/complete?result=cancelled`);
  assert.match(done.headers.get('location'), /status=cancelled/);
  assert.equal(b.jar.nl_session, undefined);
  const replay = await b.call(`${path}/complete?result=ok`);
  assert.match(replay.headers.get('location'), /status=expired/);
});

test('identity: custom returnUrl on an allowed origin is honoured', async () => {
  const b = browser();
  const created = await b.json('/v1/identity/sessions', {
    method: 'POST',
    body: { returnUrl: 'http://localhost:5173/en/auth/callback' },
  });
  const path = new URL(created.body.redirectUrl).pathname;
  const done = await b.call(`${path}/complete?result=ok`);
  assert.match(done.headers.get('location'), /^http:\/\/localhost:5173\/en\/auth\/callback\?status=ok/);
});

test('already_subscribed and not_trial_eligible show up on /v1/me', async () => {
  const b = browser();
  await identify(b);
  const sub = await b.json('/v1/me', { scenario: 'already_subscribed' });
  assert.equal(sub.body.activeSubscription.status, 'active');
  const blocked = await b.json('/v1/orders', { method: 'POST', scenario: 'already_subscribed', body: { planId: 'plan_std_m' } });
  assert.equal(blocked.status, 409);
  const trial = await b.json('/v1/me', { scenario: 'not_trial_eligible' });
  assert.equal(trial.body.trialEligible, false);
});

test('api_500 breaks identity, me and orders but not plans', async () => {
  const b = browser();
  assert.equal((await b.json('/v1/plans?market=EE', { scenario: 'api_500' })).status, 200);
  assert.equal((await b.json('/v1/identity/sessions', { method: 'POST', scenario: 'api_500', body: {} })).status, 500);
  assert.equal((await b.json('/v1/me', { scenario: 'api_500' })).status, 500);
  const o = await b.json('/v1/orders', { method: 'POST', scenario: 'api_500', body: { planId: 'plan_std_m' } });
  assert.equal(o.status, 500);
  assert.equal(o.body.errors[0].code, 'internal_error');
});

test('payment_declined ends as failed', async () => {
  const b = browser();
  await identify(b);
  const order = await startOrder(b, 'payment_declined');
  const payPath = new URL(order.paymentUrl).pathname;
  await b.call(`${payPath}/submit?action=pay`);
  await waitForStatus(b, order.orderId, 'failed');
  const me = await b.json('/v1/me');
  assert.equal(me.body.activeSubscription, null);
});

test('cancelling on the payment page fails the order and flags the return', async () => {
  const b = browser();
  await identify(b);
  const order = await startOrder(b);
  const payPath = new URL(order.paymentUrl).pathname;
  const r = await b.call(`${payPath}/submit?action=cancel`);
  assert.match(r.headers.get('location'), /cancelled=1/);
  await waitForStatus(b, order.orderId, 'failed');
});

test('payment_slow stays pending for a while, then becomes paid', async () => {
  const b = browser();
  await identify(b);
  const order = await startOrder(b, 'payment_slow');
  const payPath = new URL(order.paymentUrl).pathname;
  await b.call(`${payPath}/submit?action=pay`);
  assert.equal((await b.json(`/v1/orders/${order.orderId}`)).body.status, 'pending');
  await sleep(120); // 45s / 100 = 450ms, so still pending
  assert.equal((await b.json(`/v1/orders/${order.orderId}`)).body.status, 'pending');
  await waitForStatus(b, order.orderId, 'paid', 60);
});

test('payment_requires_action exposes an actionUrl, then completes after approval', async () => {
  const b = browser();
  await identify(b);
  const order = await startOrder(b, 'payment_requires_action');
  const payPath = new URL(order.paymentUrl).pathname;
  const submit = await b.call(`${payPath}/submit?action=pay`);
  assert.match(submit.headers.get('location'), /\/challenge$/);
  const status = await b.json(`/v1/orders/${order.orderId}`);
  assert.equal(status.body.status, 'requires_action');
  assert.match(status.body.actionUrl, /\/challenge$/);
  const challenge = await b.call(`${payPath}/challenge`);
  assert.equal(challenge.status, 200);
  const done = await b.call(`${payPath}/challenge/complete?result=approve`);
  assert.equal(done.status, 302);
  await waitForStatus(b, order.orderId, 'paid');
});

test('cms: entries exist for six market and locale pairs, LV is partly empty', async () => {
  const b = browser();
  for (const [market, locale] of [['EE', 'et'], ['EE', 'en'], ['LV', 'lv'], ['LV', 'en'], ['LT', 'lt'], ['LT', 'en']]) {
    const r = await b.json(`/cms/v1/plan-pages?market=${market}&locale=${locale}`);
    assert.equal(r.status, 200, `${market}/${locale}`);
    assert.equal(r.body.planCards.length, 3);
  }
  const lv = await b.json('/cms/v1/plan-pages?market=LV&locale=lv');
  assert.deepEqual(lv.body.legalText, []);
  assert.equal((await b.json('/cms/v1/plan-pages?market=EE&locale=lt')).status, 404);
  assert.equal((await b.json('/cms/v1/plan-pages?market=../&locale=et')).status, 400);
});

test('landing page, reset and state endpoints respond', async () => {
  const b = browser();
  const home = await b.call('/');
  assert.equal(home.status, 200);
  assert.match(await home.text(), /payment_requires_action/);
  const set = await b.call('/__mock/scenario/payment_slow');
  assert.equal(set.status, 302);
  assert.equal(b.jar.nl_scenario, 'payment_slow');
  const reset = await b.json('/__mock/reset', { method: 'POST' });
  assert.equal(reset.body.ok, true);
  const st = await b.json('/__mock/state');
  assert.equal(st.body.scenario, 'payment_slow');
});
