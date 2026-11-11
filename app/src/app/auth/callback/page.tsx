import { AuthCallback } from '@/components/eid/AuthCallback/AuthCallback';
import { getConfig } from '@/config';

export default function AuthCallbackPage() {
  const { API_BASE, ACCOUNT_URL, flags } = getConfig();
  return <AuthCallback apiBase={API_BASE} accountUrl={ACCOUNT_URL} reviewStep={flags.reviewStep} />;
}
