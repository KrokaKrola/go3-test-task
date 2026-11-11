import type { ReactNode } from 'react';
import { DocumentShell } from '@/components/DocumentShell/DocumentShell';

// No metadata title: StepScreen sets it per state. <html lang> is set by PaymentReturn (client context).
export default function PaymentReturnLayout({ children }: { children: ReactNode }) {
  return <DocumentShell lang="en">{children}</DocumentShell>;
}
