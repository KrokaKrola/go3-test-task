import type { ReactNode } from 'react';
import { Gtm } from '@/analytics/gtm/Gtm';
import type { Locale } from '@/domain/locale/locale';
import '@/styles/globals.css';

export function DocumentShell({ lang, children }: { lang: Locale; children: ReactNode }) {
  return (
    <html lang={lang}>
      <body>
        {children}
        <Gtm />
      </body>
    </html>
  );
}
