import { RUN_GATE_PARAM } from '@/flow/exitUrl/exitUrl';

// While Plans runs the Gate for `rungate=1` (Q68, reviewStep off), only the "Opening payment"
// screen shows, so the cards don't flash between eID and payment (Q77).
export const HANDOFF_ATTR = 'data-payment-handoff';

// Inline, before the page content: marks <html> ahead of the first paint of the static HTML.
export const HANDOFF_BOOT_SCRIPT = `if(new URLSearchParams(location.search).get(${JSON.stringify(
  RUN_GATE_PARAM,
)})==='1')document.documentElement.setAttribute(${JSON.stringify(HANDOFF_ATTR)},'')`;

export const isHandoffActive = () => document.documentElement.hasAttribute(HANDOFF_ATTR);

export const endHandoff = () => document.documentElement.removeAttribute(HANDOFF_ATTR);
