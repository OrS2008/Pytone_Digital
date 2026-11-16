// Stripe webhook → account entitlement, with the real route handler.
// Stripe's API is answered by a local mock; the signature is generated
// with the official SDK helper and the test webhook secret, so this
// exercises the same verification path as production.

import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { freshEnv, seedUser, request, mockFetch } from './helpers.mjs';

const require = createRequire(import.meta.url);
const Stripe = require('stripe');
const webhook = () => import('../../src/app/api/billing/webhook/route.ts');
const me = () => import('../../src/app/api/auth/me/route.ts');

let net;
afterEach(() => net?.restore());

const PERIOD_END = Math.floor(Date.now() / 1000) + 30 * 86400;

function stripeApi(email, status = 'active') {
  return [[(u) => u.startsWith('https://api.stripe.com/'), (u, req) => {
    const path = new URL(u).pathname;
    if (path.startsWith('/v1/subscriptions/')) {
      return Response.json({ id: 'sub_1', object: 'subscription', customer: 'cus_1', status, metadata: { plan: 'single' },
        items: { object: 'list', data: [{ id: 'si_1', current_period_end: PERIOD_END }] } });
    }
    if (path === '/v1/customers/cus_1' && req.method === 'GET') return Response.json({ id: 'cus_1', object: 'customer', email });
    if (path === '/v1/customers/cus_1') return Response.json({ id: 'cus_1', object: 'customer', email });
    return Response.json({ error: { message: 'unmocked ' + path } }, { status: 404 });
  }]];
}

function signed(event, secret = process.env.STRIPE_WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
  return { payload, header };
}

const deliver = async ({ payload, header }) => (await webhook()).POST(await request('/api/billing/webhook', {
  method: 'POST', body: payload, headers: { 'stripe-signature': header, 'content-type': 'application/json' },
}));

const accessOf = async (cookie) => (await (await (await me()).GET(await request('/api/auth/me', { cookie }))).json()).access;

test('checkout.session.completed grants access; subscription.deleted revokes it', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv, { expired: true });
  net = mockFetch(stripeApi(u.email));
  assert.equal((await accessOf(u.cookie)).status, 'expired');

  const done = signed({ id: 'evt_1', object: 'event', type: 'checkout.session.completed',
    data: { object: { id: 'cs_1', object: 'checkout.session', customer: 'cus_1', subscription: 'sub_1', customer_email: u.email } } });
  assert.equal((await deliver(done)).status, 200);
  const a = await accessOf(u.cookie);
  assert.equal(a.status, 'subscribed');
  assert.ok(a.subscribedUntil >= PERIOD_END * 1000, 'access runs to the end of the paid period');

  net.restore();
  net = mockFetch(stripeApi(u.email, 'canceled'));
  const del = signed({ id: 'evt_2', object: 'event', type: 'customer.subscription.deleted',
    data: { object: { id: 'sub_1', object: 'subscription', customer: 'cus_1', status: 'canceled', metadata: {}, items: { data: [{ current_period_end: PERIOD_END }] } } } });
  assert.equal((await deliver(del)).status, 200);
  assert.equal((await accessOf(u.cookie)).status, 'expired');
});

test('forged or unsigned events are rejected and change nothing', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv, { expired: true });
  net = mockFetch(stripeApi(u.email));
  const evt = { id: 'evt_f', object: 'event', type: 'checkout.session.completed',
    data: { object: { customer: 'cus_1', subscription: 'sub_1' } } };
  assert.equal((await deliver(signed(evt, 'whsec_attacker_guess'))).status, 400);
  const res = await (await webhook()).POST(await request('/api/billing/webhook', { method: 'POST', body: JSON.stringify(evt) }));
  assert.equal(res.status, 400);
  assert.equal((await accessOf(u.cookie)).status, 'expired');
  assert.ok(!net.calls.some((c) => c.url.includes('api.stripe.com')), 'no Stripe call for an unverified event');
});

test('a re-delivered event is processed once (durable idempotency)', async () => {
  const kv = freshEnv();
  const u = await seedUser(kv, { expired: true });
  net = mockFetch(stripeApi(u.email));
  const e = signed({ id: 'evt_dup', object: 'event', type: 'checkout.session.completed',
    data: { object: { customer: 'cus_1', subscription: 'sub_1' } } });
  await deliver(e);
  const before = net.calls.length;
  const again = await deliver(e);
  assert.equal((await again.json()).duplicate, true);
  assert.equal(net.calls.length, before, 'duplicate must not call Stripe again');
  assert.ok(kv.map.has('stripe_evt:evt_dup'));
});
