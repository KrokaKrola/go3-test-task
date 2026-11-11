import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { brandName } from '@/brand';
import { DocumentShell } from '@/components/DocumentShell/DocumentShell';

export const metadata: Metadata = { title: brandName };

export default function RootGroupLayout({ children }: { children: ReactNode }) {
  return <DocumentShell lang="et">{children}</DocumentShell>;
}
