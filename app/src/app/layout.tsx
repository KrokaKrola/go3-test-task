import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { brandName } from '@/brand';
import { Gtm } from '@/analytics/gtm/Gtm';

export const metadata: Metadata = { title: brandName };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="et">
      <body>
        {children}
        <Gtm />
      </body>
    </html>
  );
}
