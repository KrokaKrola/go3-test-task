import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { brandName } from '@/brand';
import { DocumentShell } from '@/components/DocumentShell/DocumentShell';
import { LanguageSwitcher } from '@/components/LanguageSwitcher/LanguageSwitcher';
import { getConfig } from '@/config';
import { HANDOFF_BOOT_SCRIPT } from '@/flow/paymentHandoff/paymentHandoff';
import { enabledPairs } from '@/domain/markets/markets';
import { getMessages } from '@/i18n/messages/messages';
import { notFound } from 'next/navigation';

export const dynamicParams = false;
export const metadata: Metadata = { title: brandName };

export function generateStaticParams() {
  return enabledPairs(getConfig().flags).map(({ market, locale }) => ({ market, locale }));
}

type Params = Promise<{ market: string; locale: string }>;

export default async function PairLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Params;
}) {
  const { market, locale } = await params;
  const pairs = enabledPairs(getConfig().flags);
  const pair = pairs.find((p) => p.market === market && p.locale === locale);
  if (!pair) notFound();
  return (
    <DocumentShell lang={pair.locale}>
      <script dangerouslySetInnerHTML={{ __html: HANDOFF_BOOT_SCRIPT }} />
      <header data-handoff-hidden="">
        <LanguageSwitcher current={pair} pairs={pairs} messages={getMessages(pair.locale)} />
      </header>
      {children}
    </DocumentShell>
  );
}
