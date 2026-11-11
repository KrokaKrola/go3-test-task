import type { ReactNode } from 'react';
import { DocumentShell } from '@/components/DocumentShell/DocumentShell';

// No metadata title: Next would reset document.title after hydration; StepScreen sets it per state.
// Locale is only known on the client (stored context or query): AuthCallback sets <html lang>.
export default function CallbackLayout({ children }: { children: ReactNode }) {
  return <DocumentShell lang="en">{children}</DocumentShell>;
}
