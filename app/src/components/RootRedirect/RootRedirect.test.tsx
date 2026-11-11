import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { enabledPairs } from '@/domain/markets/markets';
import { getMessages } from '@/i18n/messages/messages';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));

import { RootRedirect } from './RootRedirect';

const pairs = enabledPairs({ 'market.LV': false });

afterEach(() => {
  replace.mockClear();
  vi.restoreAllMocks();
});

describe('RootRedirect', () => {
  it('navigates to pickRootPair result', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-LT', 'et']);
    render(<RootRedirect messages={getMessages('et')} pairs={pairs} />);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/lt/en/');
  });

  it('falls back to /ee/et/ with no match', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ru']);
    render(<RootRedirect messages={getMessages('et')} pairs={pairs} />);
    expect(replace).toHaveBeenCalledExactlyOnceWith('/ee/et/');
  });
});
