import { track } from './analytics';

// unknown event is a type error
// @ts-expect-error not one of the six events
track('page_scrolled', {});

// @ts-expect-error params must match the event
track('plan_selected', { identified: true });

track('plan_selected', { plan_id: 'plan_basic_m' });
