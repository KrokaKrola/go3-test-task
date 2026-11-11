import type { ReactNode } from 'react';
import { Gtm } from '@/analytics/gtm/Gtm';
import type { Locale } from '@/domain/locale/locale';
import '@/styles/globals.css';

export function DocumentShell({ lang, children }: { lang: Locale; children: ReactNode }) {
  return (
    // The payment handoff script may mark <html> before hydration (Q77).
    <html lang={lang} suppressHydrationWarning>
      <body>
        {children}
        <Gtm />
      </body>
    </html>
  );
}
