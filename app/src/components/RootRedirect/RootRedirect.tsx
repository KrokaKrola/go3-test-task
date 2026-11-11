'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { pickRootPair, type Pair } from '@/domain/markets/markets';
import type { Messages } from '@/i18n/messages/messages';
import { LiveRegion } from '@/components/LiveRegion/LiveRegion';

export function RootRedirect({ messages, pairs }: { messages: Messages; pairs: readonly Pair[] }) {
  const router = useRouter();
  useEffect(() => {
    const { market, locale } = pickRootPair(navigator.languages, pairs);
    router.replace(`/${market}/${locale}/`);
  }, [router, pairs]);

  return (
    <main>
      <h1>{messages['root.redirecting']}</h1>
      <LiveRegion text={messages['root.redirecting']} />
      <noscript>
        <Link href="/ee/et/">{messages['root.continue']}</Link>
      </noscript>
    </main>
  );
}
