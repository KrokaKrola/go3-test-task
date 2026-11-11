'use client';

import { useState } from 'react';
import { navigate } from '@/flow/navigate/navigate';
import type { Messages } from '@/i18n/messages/messages';

type Props = { apiBase: string; messages: Messages };

// nl_session is HttpOnly on the API host and the API has no logout, so the mock reset is the only way to drop it.
async function dropMockSession(apiBase: string): Promise<void> {
  try {
    await fetch(`${apiBase}/__mock/reset`, { method: 'POST', credentials: 'include' });
  } catch {
    // best effort: still clear local state and leave
  }
}

function clearSessionStorage(): void {
  try {
    window.sessionStorage.clear();
  } catch {
    // blocked site data: nothing stored
  }
}

export function AccountStub({ apiBase, messages }: Props) {
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    setLoggingOut(true);
    await dropMockSession(apiBase);
    clearSessionStorage();
    navigate('/');
  }

  return (
    <main>
      <h1>{messages['accountStub.title']}</h1>
      <p>{messages['accountStub.body']}</p>
      <button type="button" onClick={logout} disabled={loggingOut} style={{ minHeight: 44 }}>
        {messages['accountStub.logout']}
      </button>
    </main>
  );
}
