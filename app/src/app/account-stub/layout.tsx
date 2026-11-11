import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { brandName } from '@/brand';
import { DocumentShell } from '@/components/DocumentShell/DocumentShell';

export const metadata: Metadata = { title: brandName };

// Dev stand-in for NEXT_PUBLIC_ACCOUNT_URL; the real account app is external.
export default function AccountStubLayout({ children }: { children: ReactNode }) {
  return <DocumentShell lang="en">{children}</DocumentShell>;
}
