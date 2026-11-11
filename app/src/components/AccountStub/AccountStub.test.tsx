import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { navigate } = vi.hoisted(() => ({ navigate: vi.fn() }));
vi.mock('@/flow/navigate/navigate', () => ({ navigate }));

import { getMessages } from '@/i18n/messages/messages';
import { AccountStub } from './AccountStub';

const messages = getMessages('en');
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  window.sessionStorage.setItem('nl_flow_context', 'x');
});

const clickLogout = () => {
  render(<AccountStub apiBase="http://api.test" messages={messages} />);
  fireEvent.click(screen.getByRole('button', { name: messages['accountStub.logout'] }));
};

describe('AccountStub', () => {
  it('logout drops mock session, clears storage, goes to root', async () => {
    fetchMock.mockResolvedValue(new Response('{}'));
    clickLogout();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(fetchMock).toHaveBeenCalledWith('http://api.test/__mock/reset', {
      method: 'POST',
      credentials: 'include',
    });
    expect(window.sessionStorage.length).toBe(0);
  });

  it('network failure still logs out locally', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    clickLogout();
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'));
    expect(window.sessionStorage.length).toBe(0);
  });
});
