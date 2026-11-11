import { AccountStub } from '@/components/AccountStub/AccountStub';
import { getConfig } from '@/config';
import { getMessages } from '@/i18n/messages/messages';

export default function AccountStubPage() {
  return <AccountStub apiBase={getConfig().API_BASE} messages={getMessages('en')} />;
}
