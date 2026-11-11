import { describe, expect, test } from 'vitest';
import type { ApiError, ApiErrorKind } from '@/api/errors/errors';
import { API_ERROR_KINDS } from '@/api/errors/errors';
import { initialState, reduce } from './machine';
import type { FlowContext, FlowEffect, FlowEvent, FlowState, StateName } from './machine';

const ctx = (over: Partial<FlowContext> = {}): FlowContext => ({
  market: 'ee',
  locale: 'et',
  planId: 'plan_std_m',
  reviewStep: true,
  identified: false,
  openOrderId: null,
  reverifyOrderId: null,
  conflictRetried: false,
  ...over,
});

const err = (kind: ApiErrorKind, extra: Partial<ApiError> = {}): ApiError => ({
  status: kind === 'network' ? 0 : 500,
  code: kind,
  message: kind,
  kind,
  ...extra,
});

const meOk = (sub = false): FlowEvent => ({
  type: 'meLoaded',
  me: { activeSubscription: sub ? { planId: 'p', status: 'active', renewsAt: 'x' } : null },
});
const order = (
  status: 'pending' | 'paid' | 'failed' | 'requires_action',
  actionUrl?: string,
): FlowEvent => ({ type: 'orderLoaded', order: { status, actionUrl } });
const ev = (type: FlowEvent['type']) => ({ type }) as FlowEvent;

const review = (c = ctx(), view = {}): FlowState => ({
  name: 'Review',
  ctx: c,
  view,
  plansError: false,
  consentError: false,
});
const plans = (c = ctx(), view = {}): FlowState => ({ name: 'Plans', ctx: c, view });
const gateOrder = (c = ctx({ openOrderId: 'o1' })): FlowState => ({
  name: 'Gate',
  ctx: c,
  step: 'order',
  orderId: c.openOrderId ?? 'o1',
});
const gateMe = (c = ctx()): FlowState => ({ name: 'Gate', ctx: c, step: 'me' });
const polling = (c = ctx({ openOrderId: 'o1' })): FlowState => ({
  name: 'Polling',
  ctx: c,
  orderId: 'o1',
  stillConfirming: false,
  connectionIssue: false,
});
const paymentReturn = (cancelledHint = false, orderId: string | null = 'o1'): FlowState => ({
  name: 'PaymentReturn',
  ctx: ctx({ openOrderId: 'o1' }),
  orderId,
  cancelledHint,
});
const s = (name: StateName, extra: object = {}): FlowState =>
  ({ name, ctx: ctx(), ...extra }) as FlowState;

const effectTypes = (effects: FlowEffect[]) => effects.map((e) => e.type);
const failed = (kind: ApiErrorKind) => ({ error: err(kind) });

type Row = [label: string, from: FlowState, event: FlowEvent, next: StateName, effects: string[]];

// Written by hand from 04 States rows and Gate steps 1 and 3.
const rows: Row[] = [
  // Entry
  ['Entry 200 + sub', s('Entry'), meOk(true), 'Account', ['redirectToAccount']],
  ['Entry 200', s('Entry'), meOk(), 'Plans', []],
  ['Entry 401', s('Entry'), { type: 'meFailed', ...failed('unauthenticated') }, 'Plans', []],
  ['Entry 5xx', s('Entry'), { type: 'meFailed', ...failed('server') }, 'Plans', []],
  ['Entry network', s('Entry'), { type: 'meFailed', ...failed('network') }, 'Plans', []],
  // Plans
  [
    'Plans select anonymous',
    plans(),
    { type: 'select', planId: 'plan_std_m' },
    'StartingEid',
    ['startEidSession'],
  ],
  [
    'Plans select identified',
    plans(ctx({ identified: true })),
    { type: 'select', planId: 'plan_std_m' },
    'Review',
    ['fetchPlans'],
  ],
  // StartingEid
  [
    'StartingEid 201',
    s('StartingEid'),
    { type: 'sessionCreated', redirectUrl: 'http://x' },
    'StartingEid',
    ['redirect'],
  ],
  [
    'StartingEid 429',
    s('StartingEid'),
    { type: 'sessionFailed', error: err('rateLimited', { retryAfterSec: 30 }) },
    'RateLimited',
    ['startCountdown'],
  ],
  [
    'StartingEid 400',
    s('StartingEid'),
    { type: 'sessionFailed', ...failed('badRequest') },
    'StartError',
    [],
  ],
  [
    'StartingEid 5xx',
    s('StartingEid'),
    { type: 'sessionFailed', ...failed('server') },
    'StartError',
    [],
  ],
  [
    'StartingEid network',
    s('StartingEid'),
    { type: 'sessionFailed', ...failed('network') },
    'StartError',
    [],
  ],
  // RateLimited
  [
    'RateLimited countdown ends',
    s('RateLimited', { retryAfterSec: 30, ready: false }),
    ev('countdownElapsed'),
    'RateLimited',
    [],
  ],
  [
    'RateLimited try again (ready)',
    s('RateLimited', { retryAfterSec: 30, ready: true }),
    ev('tryAgain'),
    'StartingEid',
    ['startEidSession'],
  ],
  [
    'RateLimited try again (not ready)',
    s('RateLimited', { retryAfterSec: 30, ready: false }),
    ev('tryAgain'),
    'RateLimited',
    [],
  ],
  [
    'RateLimited change plan',
    s('RateLimited', { retryAfterSec: 30, ready: true }),
    ev('changePlan'),
    'Plans',
    [],
  ],
  // StartError
  ['StartError try again', s('StartError'), ev('tryAgain'), 'StartingEid', ['startEidSession']],
  ['StartError change plan', s('StartError'), ev('changePlan'), 'Plans', []],
  // EidCallback
  [
    'EidCallback ok',
    s('EidCallback', { status: 'ok' }),
    ev('begin'),
    'Verifying',
    ['replaceHistory', 'fetchMe'],
  ],
  [
    'EidCallback cancelled',
    s('EidCallback', { status: 'cancelled' }),
    ev('begin'),
    'EidFailed',
    ['replaceHistory'],
  ],
  [
    'EidCallback expired',
    s('EidCallback', { status: 'expired' }),
    ev('begin'),
    'EidFailed',
    ['replaceHistory'],
  ],
  [
    'EidCallback missing',
    s('EidCallback', { status: null }),
    ev('begin'),
    'EidFailed',
    ['replaceHistory'],
  ],
  [
    'EidCallback unknown',
    s('EidCallback', { status: 'weird' }),
    ev('begin'),
    'EidFailed',
    ['replaceHistory'],
  ],
  // EidFailed
  [
    'EidFailed try again',
    s('EidFailed', { reason: 'cancelled' }),
    ev('tryAgain'),
    'StartingEid',
    ['startEidSession'],
  ],
  ['EidFailed change plan', s('EidFailed', { reason: 'expired' }), ev('changePlan'), 'Plans', []],
  // Verifying
  [
    'Verifying 401',
    s('Verifying'),
    { type: 'meFailed', ...failed('unauthenticated') },
    'OtherBrowser',
    [],
  ],
  ['Verifying 5xx', s('Verifying'), { type: 'meFailed', ...failed('server') }, 'VerifyError', []],
  [
    'Verifying network',
    s('Verifying'),
    { type: 'meFailed', ...failed('network') },
    'VerifyError',
    [],
  ],
  [
    'Verifying 200 + orderId beats subscription',
    { name: 'Verifying', ctx: ctx({ reverifyOrderId: 'o1' }) },
    meOk(true),
    'PaymentReturn',
    ['fetchOrder'],
  ],
  ['Verifying 200 + sub', s('Verifying'), meOk(true), 'Account', ['redirectToAccount']],
  ['Verifying 200', s('Verifying'), meOk(), 'Review', ['fetchPlans']],
  // VerifyError
  ['VerifyError try again', s('VerifyError'), ev('tryAgain'), 'Verifying', ['fetchMe']],
  [
    'VerifyError start again',
    s('VerifyError'),
    ev('startAgain'),
    'StartingEid',
    ['startEidSession'],
  ],
  // OtherBrowser
  [
    'OtherBrowser start again here',
    s('OtherBrowser'),
    ev('startAgain'),
    'StartingEid',
    ['startEidSession'],
  ],
  // Review
  ['Review plan missing', review(), { type: 'plansChecked', planFound: false }, 'Plans', []],
  ['Review plan found', review(), { type: 'plansChecked', planFound: true }, 'Review', []],
  [
    'Review plans fetch fails',
    review(),
    { type: 'plansFailed', ...failed('server') },
    'Review',
    [],
  ],
  [
    'Review retry plans',
    { ...review(), plansError: true } as FlowState,
    ev('retryPlans'),
    'Review',
    ['fetchPlans'],
  ],
  ['Review Pay unchecked', review(), { type: 'pay', consent: false }, 'Review', []],
  ['Review Pay checked', review(), { type: 'pay', consent: true }, 'Gate', ['fetchMe']],
  [
    'Review Pay checked, open order',
    review(ctx({ openOrderId: 'o1' })),
    { type: 'pay', consent: true },
    'Gate',
    ['fetchOrder'],
  ],
  ['Review change plan', review(), ev('changePlan'), 'Plans', []],
  // CreatingOrder
  [
    'CreatingOrder 201',
    s('CreatingOrder'),
    { type: 'orderCreated', orderId: 'o2', paymentUrl: 'http://pay' },
    'CreatingOrder',
    ['saveOpenOrder', 'redirect'],
  ],
  [
    'CreatingOrder 401',
    s('CreatingOrder'),
    { type: 'orderCreateFailed', ...failed('unauthenticated') },
    'StartingEid',
    ['startEidSession'],
  ],
  [
    'CreatingOrder already_subscribed',
    s('CreatingOrder'),
    { type: 'orderCreateFailed', ...failed('alreadySubscribed') },
    'Account',
    ['redirectToAccount'],
  ],
  [
    'CreatingOrder other 409',
    s('CreatingOrder'),
    { type: 'orderCreateFailed', ...failed('conflict') },
    'Gate',
    ['fetchMe'],
  ],
  [
    'CreatingOrder invalid_plan',
    s('CreatingOrder'),
    { type: 'orderCreateFailed', ...failed('invalidPlan') },
    'Plans',
    [],
  ],
  [
    'CreatingOrder 5xx',
    s('CreatingOrder'),
    { type: 'orderCreateFailed', ...failed('server') },
    'Review',
    ['fetchPlans'],
  ],
  [
    'CreatingOrder network',
    s('CreatingOrder'),
    { type: 'orderCreateFailed', ...failed('network') },
    'Review',
    ['fetchPlans'],
  ],
  // PaymentReturn
  [
    'PaymentReturn failed + cancelled=1',
    paymentReturn(true),
    order('failed'),
    'Review',
    ['clearOpenOrder', 'fetchPlans'],
  ],
  [
    'PaymentReturn failed',
    paymentReturn(),
    order('failed'),
    'Review',
    ['clearOpenOrder', 'fetchPlans'],
  ],
  ['PaymentReturn paid', paymentReturn(), order('paid'), 'Confirmed', ['confirmOrder']],
  ['PaymentReturn pending', paymentReturn(), order('pending'), 'Polling', ['startPolling']],
  [
    'PaymentReturn requires_action',
    paymentReturn(),
    order('requires_action', 'http://a'),
    'Polling',
    ['startPolling'],
  ],
  ['PaymentReturn no orderId', paymentReturn(false, null), ev('begin'), 'Plans', []],
  [
    'PaymentReturn error',
    paymentReturn(),
    { type: 'orderFailed', ...failed('unauthenticated') },
    'Polling',
    ['startPolling'],
  ],
  // Polling
  ['Polling paid', polling(), order('paid'), 'Confirmed', ['confirmOrder']],
  ['Polling failed', polling(), order('failed'), 'Review', ['clearOpenOrder', 'fetchPlans']],
  [
    'Polling requires_action',
    polling(),
    order('requires_action', 'http://a'),
    'Polling',
    ['redirect'],
  ],
  ['Polling pending', polling(), order('pending'), 'Polling', []],
  ['Polling 20 s', polling(), ev('stillConfirming'), 'Polling', []],
  ['Polling 3 min', polling(), ev('pollTimeout'), 'Unconfirmed', []],
  ['Polling 5xx', polling(), { type: 'orderFailed', ...failed('server') }, 'Polling', []],
  ['Polling network', polling(), { type: 'orderFailed', ...failed('network') }, 'Polling', []],
  [
    'Polling 401',
    polling(),
    { type: 'orderFailed', ...failed('unauthenticated') },
    'IdentityLost',
    [],
  ],
  [
    'Polling 404',
    polling(),
    { type: 'orderFailed', ...failed('orderNotFound') },
    'OrderNotFound',
    ['clearOpenOrder'],
  ],
  // PaymentFailed lands on the retry point with a notice
  [
    'Declined notice at Review: Pay',
    review(ctx(), { notice: 'payment_declined' }),
    { type: 'pay', consent: true },
    'Gate',
    ['fetchMe'],
  ],
  [
    'Declined notice at Review: change plan',
    review(ctx(), { notice: 'payment_declined' }),
    ev('changePlan'),
    'Plans',
    [],
  ],
  // Unconfirmed
  [
    'Unconfirmed check again',
    s('Unconfirmed', { orderId: 'o1' }),
    ev('checkAgain'),
    'Unconfirmed',
    ['fetchOrder'],
  ],
  [
    'Unconfirmed paid',
    s('Unconfirmed', { orderId: 'o1' }),
    order('paid'),
    'Confirmed',
    ['confirmOrder'],
  ],
  [
    'Unconfirmed failed',
    s('Unconfirmed', { orderId: 'o1' }),
    order('failed'),
    'Review',
    ['clearOpenOrder', 'fetchPlans'],
  ],
  [
    'Unconfirmed requires_action',
    s('Unconfirmed', { orderId: 'o1' }),
    order('requires_action', 'http://a'),
    'Unconfirmed',
    ['redirect'],
  ],
  ['Unconfirmed pending', s('Unconfirmed', { orderId: 'o1' }), order('pending'), 'Unconfirmed', []],
  [
    'Unconfirmed 401',
    s('Unconfirmed', { orderId: 'o1' }),
    { type: 'orderFailed', ...failed('unauthenticated') },
    'IdentityLost',
    [],
  ],
  [
    'Unconfirmed 404',
    s('Unconfirmed', { orderId: 'o1' }),
    { type: 'orderFailed', ...failed('orderNotFound') },
    'OrderNotFound',
    ['clearOpenOrder'],
  ],
  [
    'Unconfirmed go to account',
    s('Unconfirmed', { orderId: 'o1' }),
    ev('goToAccount'),
    'Account',
    ['redirectToAccount'],
  ],
  // IdentityLost
  [
    'IdentityLost verify',
    s('IdentityLost', { orderId: 'o1' }),
    ev('verify'),
    'StartingEid',
    ['startEidSession'],
  ],
  // OrderNotFound
  [
    'OrderNotFound back to plans',
    s('OrderNotFound', { orderId: 'o1' }),
    ev('backToPlans'),
    'Plans',
    [],
  ],
  [
    'OrderNotFound go to account',
    s('OrderNotFound', { orderId: 'o1' }),
    ev('goToAccount'),
    'Account',
    ['redirectToAccount'],
  ],
  // Confirmed
  [
    'Confirmed go to account',
    s('Confirmed', { orderId: 'o1' }),
    ev('goToAccount'),
    'Account',
    ['redirectToAccount'],
  ],
  [
    'Confirmed reload',
    s('Confirmed', { orderId: 'o1' }),
    ev('begin'),
    'Confirmed',
    ['confirmOrder'],
  ],
  // Account
  ['Account on enter', s('Account'), ev('begin'), 'Account', ['redirectToAccount']],
  // Gate step 1
  ['Gate1 pending', gateOrder(), order('pending'), 'Resume', []],
  ['Gate1 requires_action', gateOrder(), order('requires_action'), 'Resume', []],
  ['Gate1 paid', gateOrder(), order('paid'), 'Confirmed', ['confirmOrder']],
  ['Gate1 failed', gateOrder(), order('failed'), 'Gate', ['clearOpenOrder', 'fetchMe']],
  [
    'Gate1 404',
    gateOrder(),
    { type: 'orderFailed', ...failed('orderNotFound') },
    'Gate',
    ['clearOpenOrder', 'fetchMe'],
  ],
  [
    'Gate1 401',
    gateOrder(),
    { type: 'orderFailed', ...failed('unauthenticated') },
    'IdentityLost',
    [],
  ],
  [
    'Gate1 5xx',
    gateOrder(),
    { type: 'orderFailed', ...failed('server') },
    'Review',
    ['fetchPlans'],
  ],
  [
    'Gate1 network',
    gateOrder(),
    { type: 'orderFailed', ...failed('network') },
    'Review',
    ['fetchPlans'],
  ],
  // Gate step 3
  ['Gate3 sub', gateMe(), meOk(true), 'Account', ['redirectToAccount']],
  [
    'Gate3 401',
    gateMe(),
    { type: 'meFailed', ...failed('unauthenticated') },
    'StartingEid',
    ['startEidSession'],
  ],
  ['Gate3 5xx', gateMe(), { type: 'meFailed', ...failed('server') }, 'Review', ['fetchPlans']],
  ['Gate3 network', gateMe(), { type: 'meFailed', ...failed('network') }, 'Review', ['fetchPlans']],
  ['Gate3 200', gateMe(), meOk(), 'CreatingOrder', ['createOrder']],
];

const ALL_STATES: StateName[] = [
  'Entry',
  'Plans',
  'StartingEid',
  'RateLimited',
  'StartError',
  'EidCallback',
  'EidFailed',
  'Verifying',
  'VerifyError',
  'OtherBrowser',
  'Review',
  'Gate',
  'Resume',
  'CreatingOrder',
  'PaymentReturn',
  'Polling',
  'Unconfirmed',
  'IdentityLost',
  'OrderNotFound',
  'Confirmed',
  'Account',
];

const FALLBACK_FIELDS = {
  orderId: 'o1',
  reason: 'declined',
  step: 'me',
  status: null,
  retryAfterSec: 1,
  ready: true,
  view: {},
  plansError: false,
  consentError: false,
  cancelledHint: false,
  stillConfirming: false,
  connectionIssue: false,
};

// Every table row's source state, or a default one for names the table has none for.
const DISABLED_SAMPLES: FlowState[] = [
  review(ctx({ openOrderId: 'o1' }), { errorKind: 'server', payDisabled: true }),
  plans(ctx({ reviewStep: false, openOrderId: 'o1' }), { errorKind: 'server', payDisabled: true }),
  { ...review(), plansError: true, consentError: true } as FlowState,
];

const samplesOf = (name: StateName): FlowState[] => {
  const extra = DISABLED_SAMPLES.filter((st) => st.name === name);
  const fromRows = rows.map((r) => r[1]).filter((st) => st.name === name);
  return [...(fromRows.length ? fromRows : [s(name, FALLBACK_FIELDS)]), ...extra];
};

const paymentNoticeOf = (state: FlowState) =>
  'view' in state && state.view.notice?.startsWith('payment_') ? state.view.notice : undefined;

const ALL_EVENTS: FlowEvent[] = [
  ev('begin'),
  meOk(),
  meOk(true),
  { type: 'meFailed', ...failed('server') },
  { type: 'select', planId: 'plan_std_m' },
  { type: 'sessionCreated', redirectUrl: 'http://x' },
  { type: 'sessionFailed', ...failed('server') },
  ev('countdownElapsed'),
  { type: 'plansChecked', planFound: true },
  { type: 'plansChecked', planFound: false },
  { type: 'plansFailed', ...failed('server') },
  ev('retryPlans'),
  { type: 'pay', consent: true },
  { type: 'pay', consent: false },
  ev('tryAgain'),
  ev('changePlan'),
  ev('startAgain'),
  ev('verify'),
  ev('checkStatus'),
  ev('checkAgain'),
  ev('goToAccount'),
  ev('backToPlans'),
  order('pending'),
  order('paid'),
  order('failed'),
  order('requires_action', 'http://a'),
  { type: 'orderFailed', ...failed('server') },
  { type: 'orderCreated', orderId: 'o2', paymentUrl: 'http://pay' },
  { type: 'orderCreateFailed', ...failed('server') },
  ev('stillConfirming'),
  ev('pollTimeout'),
];

describe('machine', () => {
  test.each(rows)('exits: %s', (_label, from, event, next, effects) => {
    const result = reduce(from, event);
    expect(result.state.name).toBe(next);
    expect(effectTypes(result.effects)).toEqual(effects);
  });

  type Payload = [label: string, from: FlowState, event: FlowEvent, expected: object];
  const eid429 = (retryAfterSec?: number): FlowEvent => ({
    type: 'sessionFailed',
    error: err('rateLimited', retryAfterSec === undefined ? {} : { retryAfterSec }),
  });
  const payloads: Payload[] = [
    [
      'PaymentReturn failed → declined',
      paymentReturn(),
      order('failed'),
      { state: { name: 'Review', view: { notice: 'payment_declined' } } },
    ],
    [
      'PaymentReturn failed + cancelled=1 → cancelled',
      paymentReturn(true),
      order('failed'),
      { state: { name: 'Review', view: { notice: 'payment_cancelled' } } },
    ],
    [
      'EidCallback cancelled',
      s('EidCallback', { status: 'cancelled' }),
      ev('begin'),
      { state: { reason: 'cancelled' } },
    ],
    [
      'EidCallback expired',
      s('EidCallback', { status: 'expired' }),
      ev('begin'),
      { state: { reason: 'expired' } },
    ],
    [
      'EidCallback missing',
      s('EidCallback', { status: null }),
      ev('begin'),
      { state: { reason: 'expired' } },
    ],
    [
      'EidCallback unknown',
      s('EidCallback', { status: 'x' }),
      ev('begin'),
      { state: { reason: 'expired' } },
    ],
    [
      '429 carries Retry-After',
      s('StartingEid'),
      eid429(45),
      {
        state: { retryAfterSec: 45, ready: false },
        effects: [{ type: 'startCountdown', seconds: 45 }],
      },
    ],
    [
      '429 without Retry-After falls back to 30 (Q35)',
      s('StartingEid'),
      eid429(),
      { state: { retryAfterSec: 30 }, effects: [{ type: 'startCountdown', seconds: 30 }] },
    ],
    [
      'Review plan missing → plan_unavailable',
      review(),
      { type: 'plansChecked', planFound: false },
      { state: { name: 'Plans', view: { notice: 'plan_unavailable' } } },
    ],
    [
      'CreatingOrder invalid_plan → plan_unavailable',
      s('CreatingOrder'),
      { type: 'orderCreateFailed', ...failed('invalidPlan') },
      { state: { name: 'Plans', view: { notice: 'plan_unavailable' } } },
    ],
    [
      'select stores planId (anonymous)',
      plans(),
      { type: 'select', planId: 'plan_prem_m' },
      {
        state: { ctx: { planId: 'plan_prem_m' } },
        effects: [{ type: 'startEidSession', planId: 'plan_prem_m' }],
      },
    ],
    [
      'select stores planId (identified)',
      plans(ctx({ identified: true })),
      { type: 'select', planId: 'plan_prem_m' },
      { state: { ctx: { planId: 'plan_prem_m' } } },
    ],
    [
      'IdentityLost verify keeps orderId for re-verify',
      s('IdentityLost', { orderId: 'o1' }),
      ev('verify'),
      { state: { ctx: { reverifyOrderId: 'o1' } } },
    ],
    [
      'Verifying with orderId → PaymentReturn for it, id consumed',
      { name: 'Verifying', ctx: ctx({ reverifyOrderId: 'o1' }) },
      meOk(),
      {
        state: { orderId: 'o1', ctx: { reverifyOrderId: null } },
        effects: [{ type: 'fetchOrder', orderId: 'o1' }],
      },
    ],
    [
      'Gate3 200 → createOrder with plan',
      gateMe(),
      meOk(),
      { effects: [{ type: 'createOrder', planId: 'plan_std_m' }] },
    ],
    [
      'CreatingOrder 201 → save + redirect',
      s('CreatingOrder'),
      { type: 'orderCreated', orderId: 'o2', paymentUrl: 'http://pay' },
      {
        state: { ctx: { openOrderId: 'o2' } },
        effects: [
          { type: 'saveOpenOrder', orderId: 'o2', paymentUrl: 'http://pay' },
          { type: 'redirect', url: 'http://pay' },
        ],
      },
    ],
    [
      'Polling requires_action → redirect to actionUrl',
      polling(),
      order('requires_action', 'http://a'),
      { effects: [{ type: 'redirect', url: 'http://a' }] },
    ],
    [
      'Gate1 pending → Resume for the open order',
      gateOrder(),
      order('pending'),
      { state: { name: 'Resume', orderId: 'o1' } },
    ],
    [
      'Gate1 5xx disables Pay',
      gateOrder(),
      { type: 'orderFailed', ...failed('server') },
      { state: { view: { errorKind: 'server', payDisabled: true } } },
    ],
    [
      'failed + cancelled=1 → Review with payment_cancelled, open order cleared',
      paymentReturn(true),
      order('failed'),
      {
        state: {
          name: 'Review',
          view: { notice: 'payment_cancelled' },
          ctx: { openOrderId: null },
        },
      },
    ],
    [
      'reviewStep off: decline → Plans + payment_declined',
      { ...paymentReturn(), ctx: ctx({ reviewStep: false, openOrderId: 'o1' }) },
      order('failed'),
      {
        state: {
          name: 'Plans',
          view: { notice: 'payment_declined' },
          ctx: { planId: 'plan_std_m' },
        },
        effects: [{ type: 'clearOpenOrder' }],
      },
    ],
    [
      'reviewStep off: Polling failed → Plans + payment_declined',
      polling(ctx({ reviewStep: false, openOrderId: 'o1' })),
      order('failed'),
      { state: { name: 'Plans', view: { notice: 'payment_declined' } } },
    ],
  ];
  test.each(payloads)('exits payload: %s', (_label, from, event, expected) => {
    const result = reduce(from, event);
    const { state, effects } = expected as { state?: object; effects?: object[] };
    if (state) expect(result.state).toMatchObject(state);
    if (effects) expect(result.effects).toMatchObject(effects);
  });

  test('Review → pay → meLoaded → CreatingOrder + createOrder (no open order)', () => {
    const paid = reduce(review(), { type: 'pay', consent: true });
    expect(paid.state).toMatchObject({ name: 'Gate', step: 'me' });
    const created = reduce(paid.state, meOk());
    expect(created.state.name).toBe('CreatingOrder');
    expect(created.effects).toEqual([{ type: 'createOrder', planId: 'plan_std_m' }]);
  });

  test('other 409 → Gate → no second createOrder', () => {
    const conflict = reduce(s('CreatingOrder'), {
      type: 'orderCreateFailed',
      ...failed('conflict'),
    });
    expect(conflict.state).toMatchObject({ name: 'Gate', step: 'me' });
    const second = reduce(conflict.state, meOk());
    expect(second.state.name).toBe('Review');
    expect(second.effects.some((e) => e.type === 'createOrder')).toBe(false);
  });

  test('other 409 → Gate → open order → Resume', () => {
    const from: FlowState = { name: 'CreatingOrder', ctx: ctx({ openOrderId: 'o1' }) };
    const conflict = reduce(from, { type: 'orderCreateFailed', ...failed('conflict') });
    expect(effectTypes(conflict.effects)).toEqual(['fetchOrder']);
    expect(reduce(conflict.state, order('pending')).state.name).toBe('Resume');
  });

  test('exits: Gate step 1 failed clears the open order from context', () => {
    const { state } = reduce(gateOrder(), order('failed'));
    expect(state.ctx.openOrderId).toBeNull();
  });

  test('reviewStep off: Verifying 200 → Gate', () => {
    const from: FlowState = { name: 'Verifying', ctx: ctx({ reviewStep: false }) };
    const result = reduce(from, meOk());
    expect(result.state.name).toBe('Gate');
    expect(effectTypes(result.effects)).toEqual(['fetchMe']);
  });

  test('identified select → Gate', () => {
    const from = plans(ctx({ identified: true, reviewStep: false }));
    expect(reduce(from, { type: 'select', planId: 'plan_std_m' }).state.name).toBe('Gate');
  });

  describe('retry point = Plans', () => {
    const off = ctx({ reviewStep: false, planId: 'plan_std_m' });
    test.each<[string, FlowState, FlowEvent]>([
      ['Gate step 3 5xx', gateMe(off), { type: 'meFailed', ...failed('server') }],
      [
        'Gate step 1 network',
        gateOrder({ ...off, openOrderId: 'o1' }),
        { type: 'orderFailed', ...failed('network') },
      ],
      [
        'CreatingOrder 5xx',
        { name: 'CreatingOrder', ctx: off },
        { type: 'orderCreateFailed', ...failed('server') },
      ],
    ])('%s lands on Plans with plan kept and error', (_l, from, event) => {
      const { state } = reduce(from, event);
      expect(state).toMatchObject({ name: 'Plans', ctx: { planId: 'plan_std_m' } });
      expect(state.name === 'Plans' && state.view.errorKind).toBeTruthy();
    });

    test('Try again at Plans goes to Gate', () => {
      const from = plans(off, { notice: 'payment_declined' });
      expect(reduce(from, ev('tryAgain')).state.name).toBe('Gate');
    });

    test('Try again at Plans ignored when reviewStep is on', () => {
      expect(reduce(plans(ctx()), ev('tryAgain')).effects).toEqual([]);
    });
  });

  test('Resume offers only checkStatus', () => {
    const resume = s('Resume', { orderId: 'o1' });
    const others: FlowEvent[] = [
      ev('tryAgain'),
      { type: 'pay', consent: true },
      ev('changePlan'),
      { type: 'select', planId: 'plan_std_m' },
      ev('backToPlans'),
      ev('retryPlans'),
    ];
    for (const event of others) {
      const result = reduce(resume, event);
      expect(result.state).toBe(resume);
      expect(result.effects).toEqual([]);
    }
    const result = reduce(resume, ev('checkStatus'));
    expect(result.state.name).toBe('PaymentReturn');
    expect(effectTypes(result.effects)).toEqual(['fetchOrder']);
  });

  test('inv1 only Pay / Try again emit createOrder', () => {
    // createOrder is emitted only on entering CreatingOrder, which only the Gate does.
    for (const name of ALL_STATES) {
      for (const from of samplesOf(name)) {
        for (const event of ALL_EVENTS) {
          const { state, effects } = reduce(from, event);
          if (effects.some((e) => e.type === 'createOrder')) {
            expect(from.name === 'Gate' && event.type === 'meLoaded').toBe(true);
            expect(state.name).toBe('CreatingOrder');
          }
          if (state.name === 'Gate' && from.name !== 'Gate') {
            const explicitOrConflictRecheck = [
              'pay',
              'tryAgain',
              'select',
              'meLoaded',
              'orderCreateFailed',
            ];
            expect(explicitOrConflictRecheck).toContain(event.type);
          }
        }
      }
    }
    const reloaded: FlowState[] = [
      { name: 'CreatingOrder', ctx: ctx() },
      gateMe(),
      review(ctx(), { notice: 'payment_declined' }),
      plans(ctx({ reviewStep: false }), { notice: 'payment_declined' }),
      review(),
    ];
    for (const from of reloaded) {
      const { effects } = reduce(from, ev('begin'));
      expect(effects.some((e) => e.type === 'createOrder')).toBe(false);
    }
  });

  test('inv3 no error kind reaches PaymentFailed', () => {
    for (const kind of API_ERROR_KINDS) {
      const error = err(kind);
      const failEvents: FlowEvent[] = [
        { type: 'meFailed', error },
        { type: 'sessionFailed', error },
        { type: 'plansFailed', error },
        { type: 'orderFailed', error },
        { type: 'orderCreateFailed', error },
      ];
      for (const name of ALL_STATES) {
        for (const from of samplesOf(name)) {
          for (const event of failEvents) {
            // a notice already on the screen may stay; errors never add one
            expect(paymentNoticeOf(reduce(from, event).state)).toBe(paymentNoticeOf(from));
          }
        }
      }
    }
  });

  test('conflict flag resets per Pay: 409 → Gate → retry point → Pay → createOrder', () => {
    const conflict = reduce(s('CreatingOrder'), {
      type: 'orderCreateFailed',
      ...failed('conflict'),
    });
    const landed = reduce(conflict.state, meOk());
    expect(landed.state.name).toBe('Review');
    const paid = reduce(landed.state, { type: 'pay', consent: true });
    const created = reduce(paid.state, meOk());
    expect(created.state.name).toBe('CreatingOrder');
    expect(created.effects).toEqual([{ type: 'createOrder', planId: 'plan_std_m' }]);
  });

  describe('disabled Pay always has a way out', () => {
    const disabledReview = () =>
      reduce(gateOrder(), { type: 'orderFailed', ...failed('server') }).state;

    test('retryCheck → order failed → Pay enabled, open order cleared → Pay reaches Gate', () => {
      const asked = reduce(disabledReview(), ev('retryCheck'));
      expect(asked.effects).toEqual([{ type: 'fetchOrder', orderId: 'o1' }]);
      const cleared = reduce(asked.state, order('failed'));
      expect(cleared.state).toMatchObject({
        view: { payDisabled: false },
        ctx: { openOrderId: null },
      });
      expect(effectTypes(cleared.effects)).toEqual(['clearOpenOrder']);
      expect(reduce(cleared.state, { type: 'pay', consent: true }).state.name).toBe('Gate');
    });

    test('retryCheck → 404 → Pay enabled', () => {
      const { state } = reduce(disabledReview(), {
        type: 'orderFailed',
        ...failed('orderNotFound'),
      });
      expect(state).toMatchObject({ view: { payDisabled: false } });
    });

    test('retryCheck → pending → Resume; paid → Confirmed; 5xx → still disabled', () => {
      const from = disabledReview();
      expect(reduce(from, order('pending')).state.name).toBe('Resume');
      expect(reduce(from, order('paid')).state.name).toBe('Confirmed');
      expect(reduce(from, { type: 'orderFailed', ...failed('server') }).state).toMatchObject({
        view: { payDisabled: true },
      });
    });

    test('retryCheck at Plans retry point (reviewStep off) re-enables Try again', () => {
      const from = plans(ctx({ reviewStep: false, openOrderId: 'o1' }), { payDisabled: true });
      const { state } = reduce(from, order('failed'));
      expect(reduce(state, ev('tryAgain')).state.name).toBe('Gate');
    });

    test('begin clears disabled flag and consent error, keeps the notice (inv. 6)', () => {
      const dirty = {
        ...review(ctx({ openOrderId: 'o1' }), { payDisabled: true, notice: 'payment_declined' }),
        consentError: true,
      } as FlowState;
      const restored = reduce(dirty, ev('begin')).state as { view: object };
      expect(restored.view).toEqual({ notice: 'payment_declined' });
      expect(restored).toMatchObject({ consentError: false, plansError: false });
      const atPlans = plans(ctx({ reviewStep: false }), {
        payDisabled: true,
        notice: 'payment_cancelled',
      });
      expect((reduce(atPlans, ev('begin')).state as { view: object }).view).toEqual({
        notice: 'payment_cancelled',
      });
    });

    test('retryCheck → 401 → IdentityLost keeps the open order (Q33)', () => {
      const { state } = reduce(disabledReview(), {
        type: 'orderFailed',
        ...failed('unauthenticated'),
      });
      expect(state).toMatchObject({
        name: 'IdentityLost',
        orderId: 'o1',
        ctx: { openOrderId: 'o1' },
      });
    });

    test('orderLoaded at a Review that is not disabled is ignored', () => {
      const healthy = review(ctx({ openOrderId: 'o1' }));
      for (const status of ['pending', 'paid', 'failed'] as const) {
        const result = reduce(healthy, order(status));
        expect(result.state).toBe(healthy);
        expect(result.effects).toEqual([]);
      }
    });
  });

  test('inv4 every non-terminal state has an exit', () => {
    const terminal: StateName[] = ['Account'];
    for (const name of ALL_STATES.filter((n) => !terminal.includes(n))) {
      // `begin` re-runs on-enter: it counts only when it leaves the state (EidCallback).
      // Every sample, so a state with all actions disabled cannot hide behind a healthy one.
      const hasExit = samplesOf(name).every((from) =>
        ALL_EVENTS.some((event) => {
          const result = reduce(from, event);
          if (event.type === 'begin') return result.state.name !== from.name;
          const changed = JSON.stringify(result.state) !== JSON.stringify(from);
          return changed || result.effects.length > 0;
        }),
      );
      expect(hasExit, name).toBe(true);
    }
  });

  describe('cancelled=1 loses to server paid/pending', () => {
    test('failed → retry point with payment_cancelled', () => {
      expect(reduce(paymentReturn(true), order('failed')).state).toMatchObject({
        name: 'Review',
        view: { notice: 'payment_cancelled' },
      });
    });
    test('paid → Confirmed', () => {
      expect(reduce(paymentReturn(true), order('paid')).state.name).toBe('Confirmed');
    });
    test('pending → Polling', () => {
      expect(reduce(paymentReturn(true), order('pending')).state.name).toBe('Polling');
    });
  });

  test('initialState starts at Entry', () => {
    expect(initialState(ctx()).name).toBe('Entry');
  });
});
